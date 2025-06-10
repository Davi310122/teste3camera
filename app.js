document.addEventListener('DOMContentLoaded', async function() {
    // Elementos da DOM
    const cameraView = document.getElementById('camera-view');
    const cameraCanvas = document.getElementById('camera-canvas');
    const captureBtn = document.getElementById('capture-btn');
    const switchCameraBtn = document.getElementById('switch-camera');
    const syncBtn = document.getElementById('sync-btn');
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
            const request = indexedDB.open('CameraAppDB', 1);
            
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
                    db.createObjectStore('photos', { keyPath: 'id' });
                }
            };
        });
    }
    
    // Inicializar Firebase (opcional - descomente se quiser sincronização)
    /*
    const firebaseConfig = {
        apiKey: "SUA_API_KEY",
        authDomain: "SEU_PROJETO.firebaseapp.com",
        projectId: "SEU_PROJETO",
        storageBucket: "SEU_PROJETO.appspot.com",
        messagingSenderId: "SEU_SENDER_ID",
        appId: "SEU_APP_ID"
    };
    
    firebase.initializeApp(firebaseConfig);
    const firestore = firebase.firestore();
    */
    
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
            synced: false
        };
        
        await savePhotoToDB(photo);
        addPhotoToGallery(photo);
        updateStorageUsage();
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
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.addEventListener('click', async function() {
            await deletePhoto(photo.id);
            photoContainer.remove();
            updateStorageUsage();
        });
        
        photoContainer.appendChild(img);
        photoContainer.appendChild(deleteBtn);
        gallery.appendChild(photoContainer);
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
    
    // Carregar fotos salvas
    async function loadPhotosFromDB() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['photos'], 'readonly');
            const store = transaction.objectStore('photos');
            const request = store.getAll();
            
            request.onsuccess = (event) => {
                resolve(event.target.result || []);
            };
            
            request.onerror = (event) => {
                console.error('Erro ao carregar fotos:', event.target.error);
                reject(event.target.error);
            };
        });
    }
    
    // Sincronizar com Firebase (opcional)
    syncBtn.addEventListener('click', async function() {
        showStatus("Sincronização com nuvem desativada neste modo", "info");
        /*
        try {
            showStatus("Iniciando sincronização...", "info");
            
            const photos = await loadPhotosFromDB();
            const unsynced = photos.filter(photo => !photo.synced);
            
            if (unsynced.length === 0) {
                showStatus("Todas as fotos já estão sincronizadas", "success");
                return;
            }
            
            const batch = firestore.batch();
            const photosRef = firestore.collection('userPhotos');
            
            for (const photo of unsynced) {
                const docRef = photosRef.doc(photo.id.toString());
                batch.set(docRef, {
                    imageData: photo.data,
                    timestamp: photo.timestamp,
                    device: navigator.userAgent
                });
                
                photo.synced = true;
                await savePhotoToDB(photo);
            }
            
            await batch.commit();
            showStatus(`${unsynced.length} fotos sincronizadas com sucesso!`, "success");
        } catch (error) {
            console.error('Erro na sincronização:', error);
            showStatus("Erro ao sincronizar fotos", "error");
        }
        */
    });
    
    // Calcular espaço utilizado
    async function updateStorageUsage() {
        try {
            const photos = await loadPhotosFromDB();
            let totalSize = 0;
            
            photos.forEach(photo => {
                // Aproximação do tamanho (data URL tem overhead de ~33%)
                totalSize += photo.data.length * 0.75;
            });
            
            const mbUsed = (totalSize / (1024 * 1024)).toFixed(2);
            storageSpaceEl.textContent = `Espaço utilizado: ${mbUsed} MB`;
        } catch (error) {
            console.error('Erro ao calcular espaço:', error);
        }
    }
    
    // Mostrar status
    function showStatus(message, type) {
        statusEl.textContent = message;
        statusEl.className = `status ${type}`;
        
        if (type !== 'info') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }
    
    // Inicializar aplicação
    try {
        await initDB();
        await startCamera(currentFacingMode);
        
        const photos = await loadPhotosFromDB();
        photos.sort((a, b) => b.id - a.id).forEach(addPhotoToGallery);
        
        await updateStorageUsage();
    } catch (error) {
        showStatus(`Erro ao iniciar aplicação: ${error}`, "error");
    }
});
