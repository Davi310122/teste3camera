document.addEventListener('DOMContentLoaded', async function() {
    // Elementos da DOM
    const cameraView = document.getElementById('camera-view');
    const cameraCanvas = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const switchCameraBtn = document.getElementById('switch-camera');
    const gallery = document.getElementById('gallery');
    const statusEl = document.getElementById('status');
    const storageSpaceEl = document.getElementById('storage-space');
    
    // Contexto do canvas
    const context = cameraCanvas.getContext('2d');
    
    // Configurações
    let photoWidth = 400;
    let photoHeight = 0;
    let currentFacingMode = 'environment';
    let stream = null;
    let db = null;
    
    // Inicializar IndexedDB
    async function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('CameraAppStorage', 1);
            
            request.onerror = (event) => {
                console.error('Erro ao abrir IndexedDB:', event.target.error);
                reject('Erro ao acessar o armazenamento local');
            };
            
            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('photos')) {
                    const store = db.createObjectStore('photos', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }
    
    // Acessar a câmera
    async function startCamera(facingMode) {
        try {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            
            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }, 
                audio: false 
            });
            
            cameraView.srcObject = stream;
            
            cameraView.onloadedmetadata = function() {
                photoHeight = cameraView.videoHeight / (cameraView.videoWidth / photoWidth);
                cameraCanvas.width = photoWidth;
                cameraCanvas.height = photoHeight;
            };
        } catch (err) {
            console.error("Erro ao acessar a câmera: ", err);
            showStatus("Não foi possível acessar a câmera. Verifique as permissões.", "error");
            
            if (facingMode === 'environment') {
                currentFacingMode = 'user';
                await startCamera(currentFacingMode);
            }
        }
    }
    
    // Trocar entre câmeras
    switchCameraBtn.addEventListener('click', async function() {
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        await startCamera(currentFacingMode);
    });
    
    // Tirar foto
    captureBtn.addEventListener('click', async function() {
        context.drawImage(cameraView, 0, 0, photoWidth, photoHeight);
        const imageData = cameraCanvas.toDataURL('image/jpeg', 0.8);
        
        const photo = {
            id: Date.now(),
            data: imageData,
            timestamp: new Date().toISOString(),
            filename: `foto_${new Date().toISOString().slice(0, 10)}_${Date.now()}.jpg`
        };
        
        await savePhotoToDB(photo);
        addPhotoToGallery(photo);
        updateStorageUsage();
        showStatus("Foto salva com sucesso!", "success");
    });
    
    // Salvar foto no IndexedDB
    async function savePhotoToDB(photo) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');
            
            const request = store.put(photo);
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Erro ao salvar foto:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // Adicionar foto à galeria
    function addPhotoToGallery(photo) {
        const photoContainer = document.createElement('div');
        photoContainer.className = 'photo-container';
        photoContainer.dataset.id = photo.id;
        
        const img = document.createElement('img');
        img.src = photo.data;
        img.className = 'photo';
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'photo-actions';
        
        // Botão de download
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'photo-btn download-btn';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
        downloadBtn.title = 'Download';
        downloadBtn.addEventListener('click', () => downloadPhoto(photo));
        
        // Botão de compartilhamento
        const shareBtn = document.createElement('button');
        shareBtn.className = 'photo-btn share-btn';
        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i>';
        shareBtn.title = 'Compartilhar';
        shareBtn.addEventListener('click', () => sharePhoto(photo));
        
        // Botão de exclusão
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'photo-btn delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.title = 'Excluir';
        deleteBtn.addEventListener('click', async () => {
            await deletePhoto(photo.id);
            photoContainer.remove();
            updateStorageUsage();
            showStatus("Foto excluída", "info");
        });
        
        actionsDiv.appendChild(downloadBtn);
        actionsDiv.appendChild(shareBtn);
        actionsDiv.appendChild(deleteBtn);
        
        photoContainer.appendChild(img);
        photoContainer.appendChild(actionsDiv);
        gallery.insertBefore(photoContainer, gallery.firstChild);
    }
    
    // Apagar foto
    async function deletePhoto(photoId) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['photos'], 'readwrite');
            const store = transaction.objectStore('photos');
            
            const request = store.delete(photoId);
            
            request.onsuccess = () => resolve();
            request.onerror = (event) => {
                console.error('Erro ao deletar foto:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // Baixar foto
    async function downloadPhoto(photo) {
        try {
            const link = document.createElement('a');
            link.href = photo.data;
            link.download = photo.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showStatus(`Foto "${photo.filename}" baixada`, "success");
        } catch (error) {
            console.error('Erro ao baixar foto:', error);
            showStatus("Erro ao baixar foto", "error");
        }
    }
    
    // Compartilhar foto
    async function sharePhoto(photo) {
        try {
            // Converter data URL para blob
            const blob = await (await fetch(photo.data)).blob();
            const file = new File([blob], photo.filename, { type: 'image/jpeg' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Foto da Câmera App',
                    text: 'Confira esta foto que eu tirei!'
                });
            } else {
                // Fallback para dispositivos sem Web Share API
                downloadPhoto(photo);
            }
        } catch (error) {
            console.error('Erro ao compartilhar:', error);
            // Se o compartilhamento falhar, oferece para baixar
            downloadPhoto(photo);
        }
    }
    
    // Carregar fotos salvas
    async function loadPhotosFromDB() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['photos'], 'readonly');
            const store = transaction.objectStore('photos');
            const index = store.index('timestamp');
            const request = index.getAll();
            
            request.onsuccess = (event) => {
                resolve(event.target.result || []);
            };
            
            request.onerror = (event) => {
                console.error('Erro ao carregar fotos:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // Calcular espaço utilizado
    async function updateStorageUsage() {
        try {
            const photos = await loadPhotosFromDB();
            let totalSize = 0;
            
            photos.forEach(photo => {
                totalSize += photo.data.length * 0.75; // Aproximação do tamanho
            });
            
            const mbUsed = (totalSize / (1024 * 1024)).toFixed(2);
            const photoCount = photos.length;
            
            storageSpaceEl.textContent = 
                `Fotos armazenadas: ${photoCount} | Espaço utilizado: ${mbUsed} MB`;
        } catch (error) {
            console.error('Erro ao calcular espaço:', error);
        }
    }
    
    // Mostrar status
    function showStatus(message, type) {
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 3000);
    }
    
    // Inicializar aplicação
    async function initApp() {
        try {
            await initDB();
            await startCamera(currentFacingMode);
            
            const photos = await loadPhotosFromDB();
            photos.reverse().forEach(addPhotoToGallery); // Mostrar as mais recentes primeiro
            
            await updateStorageUsage();
            
            // Verificar suporte a compartilhamento
            if (!navigator.share) {
                console.log('Web Share API não suportada');
            }
        } catch (error) {
            showStatus(`Erro ao iniciar aplicação: ${error}`, "error");
        }
    }
    
    // Iniciar
    initApp();
});
