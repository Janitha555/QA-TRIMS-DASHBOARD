// ==========================================
// Global Variables & Configuration
// ==========================================
let currentUser = null;
let currentUserRole = "operator";

// 🔴 GitHub Profile Default Avatar URL
const DEFAULT_AVATAR = "https://raw.githubusercontent.com/Janitha555/QA-TRIMS-DASHBOARD/main/profile.png";

// Default Date එක Today ලෙස සැකසීම
if (document.getElementById('filterDate')) {
    document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];
}

// ==========================================
// Firebase Auth State Listener
// ==========================================
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        setElementDisplay('auth-screen', 'none');
        setElementDisplay('app-screen', 'block');

        rtdb.ref('users/' + user.uid).once('value').then((snapshot) => {
            const userData = snapshot.val();

            if ((userData && userData.role === 'admin') || (user.email && user.email.includes('admin'))) {
                currentUserRole = 'admin';
            } else {
                currentUserRole = 'operator';
            }

            updateUserUI(userData ? userData.name : (user.email ? user.email.split('@')[0] : 'User'), userData ? userData.photoURL : null);

            if (currentUserRole === 'admin') {
                setElementDisplay('master-admin-panel', 'block');
                loadSystemUsers();
            } else {
                setElementDisplay('master-admin-panel', 'none');
            }

            loadData();
        }).catch((err) => {
            console.error("Auth Data Load Error:", err);
            if (user.email && user.email.includes('admin')) {
                currentUserRole = 'admin';
                setElementDisplay('master-admin-panel', 'block');
                loadSystemUsers();
            }
            updateUserUI(user.email ? user.email.split('@')[0] : 'User', null);
            loadData();
        });

    } else {
        currentUser = null;
        currentUserRole = "operator";
        setElementDisplay('auth-screen', 'flex');
        setElementDisplay('app-screen', 'none');
    }
});

// ==========================================
// Helper Functions
// ==========================================

// Safely set DOM element display
function setElementDisplay(id, displayType) {
    const el = document.getElementById(id);
    if (el) el.style.display = displayType;
}

// Update User UI (Navbar details)
function updateUserUI(name, photo) {
    const navUsername = document.getElementById('nav-username');
    const navRole = document.getElementById('nav-role');
    const navAvatar = document.getElementById('nav-avatar');

    if (navUsername) navUsername.innerText = name || "User";
    if (navRole) navRole.innerText = currentUserRole.toUpperCase();

    if (navAvatar) navAvatar.src = photo || DEFAULT_AVATAR;
}

// ==========================================
// Authentication Handlers
// ==========================================

// Login Handler
function handleLogin(e) {
    e.preventDefault();
    const userInput = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const errDiv = document.getElementById('login-error');
    if (errDiv) errDiv.innerText = 'Authenticating...';

    const constructedEmail = userInput.includes('@') ? userInput : `${userInput}@trims.com`;

    auth.signInWithEmailAndPassword(constructedEmail, pass)
        .then(() => {
            if (errDiv) errDiv.innerText = '';
        })
        .catch((err) => {
            console.error("Login Error:", err);
            if (errDiv) errDiv.innerText = "Error: Invalid Credentials";
        });
}

// Logout Handler
function handleLogout() {
    auth.signOut();
}

// Register New User Function (Admin only)
async function handleCreateUser(e) {
    e.preventDefault();

    const name = document.getElementById('new-user-name').value.trim();
    const userInput = document.getElementById('new-user-email').value.trim();
    const pass = document.getElementById('new-user-pass').value;

    const email = userInput.includes('@') ? userInput : `${userInput}@trims.com`;

    try {
        let secondaryApp;
        const existingApp = firebase.apps.find(app => app.name === "SecondaryApp");
        
        if (existingApp) {
            secondaryApp = existingApp;
        } else {
            secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
        }

        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        const newUser = userCredential.user;

        await rtdb.ref('users/' + newUser.uid).set({
            name: name,
            email: email,
            role: 'operator',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        await secondaryApp.auth().signOut();

        alert(`✅ Operator "${name}" සාර්ථකව එකතු කරන ලදී!`);

        e.target.reset();
        loadSystemUsers();

    } catch (error) {
        console.error("Error creating user:", error);
        alert("❌ Error Registering User: " + error.message);
    }
}

// System Users ලැයිස්තුව Load කිරීම
function loadSystemUsers() {
    const select = document.getElementById('master-user-select');
    const userListUI = document.getElementById('users-list');

    let selectHTML = `<option value="ALL">Show All Users Data</option>`;
    let listHTML = '';

    rtdb.ref('users').once('value').then((snapshot) => {
        snapshot.forEach((childSnap) => {
            const uid = childSnap.key;
            const data = childSnap.val();
            selectHTML += `<option value="${uid}">${data.name || 'User'} (${data.email || 'No Email'})</option>`;
            listHTML += `<li style="padding: 4px 0; border-bottom: 1px solid #f1f5f9;">👤 <strong>${data.name || 'User'}</strong> - <span class="badge badge-role">${data.role || 'operator'}</span></li>`;
        });

        if (select) select.innerHTML = selectHTML;
        if (userListUI) userListUI.innerHTML = listHTML;
    }).catch(err => console.error("Error loading system users:", err));
}

// ==========================================
// Profile Image Handling & Compression
// ==========================================

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert("❌ කරුණාකර වලංගු Image එකක් තෝරන්න!");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const img = new Image();
        img.src = e.target.result;

        img.onload = function () {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            const maxWidth = 300;
            const maxHeight = 300;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width *= maxHeight / height;
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            const base64Image = canvas.toDataURL('image/jpeg', 0.7);

            if (currentUser) {
                rtdb.ref('users/' + currentUser.uid).update({
                    photoURL: base64Image
                }).then(() => {
                    const navAvatar = document.getElementById('nav-avatar');
                    if (navAvatar) navAvatar.src = base64Image;
                    alert("✅ Profile Picture එක සාර්ථකව Update විය!");
                }).catch((err) => {
                    alert("❌ Save Error: " + err.message);
                });
            }
        };
    };

    reader.readAsDataURL(file);
}

// ==========================================
// Form Mechanics & Inspection Management
// ==========================================

// Dynamic Article/Color Row Add for 20% Inspection
function addArticleColorRow() {
    const container = document.getElementById('article-color-rows');
    if (!container) return;
    
    const newRow = document.createElement('div');
    newRow.className = 'article-row';
    newRow.innerHTML = `
        <input type="text" class="item-article" placeholder="Article Specs">
        <input type="text" class="item-color" placeholder="Color">
        <input type="number" class="item-qty" placeholder="Qty">
        <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(newRow);
}

// 100% / 20% Type Change Listener
function toggleCheckTypeFields() {
    const checkTypeElem = document.getElementById('checkType');
    if (!checkTypeElem) return;

    const type = checkTypeElem.value;
    const poElem = document.getElementById('poNumber');
    const po = poElem ? poElem.value.trim() : '';

    setElementDisplay('hundred-percent-fields', type === '100%' ? 'block' : 'none');
    setElementDisplay('dynamic-article-container', type === '20%' ? 'block' : 'none');

    // 100% තෝරාගෙන ඇති විට PO Number එකක් තිබේ නම් Database එකෙන් Data Auto-fill කිරීම
    if (type === '100%' && po !== '') {
        checkExistingPOQty(po);
    }
}

// 🔄 Same PO Logic for 100% Inspection
async function checkExistingPOQty(po) {
    if (!po) return;

    try {
        const snap = await rtdb.ref('inspection_logs').orderByChild('poNumber').equalTo(po).once('value');
        
        let existingTotalQty = null;
        let existingArticle = '';
        let existingColor = '';

        snap.forEach(child => {
            const d = child.val();
            if (d.checkType === '100%') {
                if (d.totalQty) existingTotalQty = d.totalQty;
                if (d.articleDetails) existingArticle = d.articleDetails;
                if (d.color) existingColor = d.color;
            }
        });

        const totalQtyInput = document.getElementById('totalQty');
        const articleInput = document.getElementById('singleArticleDetails');
        const colorInput = document.getElementById('singleColor');

        if (existingTotalQty !== null && totalQtyInput) {
            totalQtyInput.value = existingTotalQty;
        }
        if (existingArticle && articleInput) {
            articleInput.value = existingArticle;
        }
        if (existingColor && colorInput) {
            colorInput.value = existingColor;
        }

    } catch (err) {
        console.error("Error checking existing PO:", err);
    }
}

// Save Entry Handler
async function handleSaveRecord(e) {
    e.preventDefault();
    if (!currentUser) {
        alert("❌ User session expired. Please login again.");
        return;
    }

    const poNumber = document.getElementById('poNumber') ? document.getElementById('poNumber').value.trim() : '';
    const checkType = document.getElementById('checkType') ? document.getElementById('checkType').value : '20%';
    const status = document.getElementById('status') ? document.getElementById('status').value : 'OK';
    const date = document.getElementById('filterDate') ? document.getElementById('filterDate').value : '';

    if (!poNumber) {
        alert("❌ කරුණාකර PO Number එක ඇතුළත් කරන්න.");
        return;
    }

    let userName = currentUser.email || 'User';
    try {
        const userSnap = await rtdb.ref('users/' + currentUser.uid).once('value');
        if (userSnap.exists() && userSnap.val().name) userName = userSnap.val().name;
    } catch (e) {
        console.warn("User fetch error:", e);
    }

    const formattedUserName = currentUserRole === 'admin' ? `${userName} (Admin)` : userName;

    if (checkType === '20%') {
        const articleInputs = document.querySelectorAll('.item-article');
        const colorInputs = document.querySelectorAll('.item-color');
        const qtyInputs = document.querySelectorAll('.item-qty');

        const savePromises = [];

        for (let i = 0; i < articleInputs.length; i++) {
            const articleDetails = articleInputs[i].value.trim();
            const color = colorInputs[i].value.trim();
            const totalQty = Number(qtyInputs[i].value) || 0;

            if (articleDetails && color && totalQty > 0) {
                const newLogRef = rtdb.ref('inspection_logs').push();
                const promise = newLogRef.set({
                    userId: currentUser.uid,
                    userName: formattedUserName,
                    poNumber,
                    articleDetails,
                    color,
                    checkType,
                    totalQty,
                    status,
                    date,
                    loggedAt: firebase.database.ServerValue.TIMESTAMP
                });
                savePromises.push(promise);
            }
        }

        if (savePromises.length === 0) {
            alert("❌ කරුණාකර අවම වශයෙන් එක Article Details, Color සහ Qty එකක්වත් ඇතුළත් කරන්න.");
            return;
        }

        await Promise.all(savePromises);

    } else {
        // 🔴 100% Inspection Save & Same PO Logic
        let totalQty = Number(document.getElementById('totalQty')?.value) || 0;
        let dailyInspectedQty = Number(document.getElementById('dailyInspectedQty')?.value) || 0;
        let dailyStoresQty = Number(document.getElementById('dailyStoresQty')?.value) || 0;
        const articleDetails = document.getElementById('singleArticleDetails')?.value.trim() || '';
        const color = document.getElementById('singleColor')?.value.trim() || '';

        if (!articleDetails || !color) {
            alert("❌ කරුණාකර 100% Inspection සඳහා Article Specs සහ Color ඇතුළත් කරන්න.");
            return;
        }

        let accumInspected = 0;
        let accumStored = 0;

        // එකම PO එකට අදාළව පැරණි Records Accumulate කිරීම
        const snap = await rtdb.ref('inspection_logs').orderByChild('poNumber').equalTo(poNumber).once('value');
        
        snap.forEach(child => {
            const d = child.val();
            if (d.checkType === '100%') {
                if (d.totalQty) totalQty = Number(d.totalQty);
                accumInspected += Number(d.dailyInspectedQty || 0);
                accumStored += Number(d.dailyStoresQty || 0);
            }
        });

        accumInspected += dailyInspectedQty;
        accumStored += dailyStoresQty;

        const newLogRef = rtdb.ref('inspection_logs').push();
        await newLogRef.set({
            userId: currentUser.uid,
            userName: formattedUserName,
            poNumber,
            articleDetails,
            color,
            checkType,
            totalQty,
            dailyInspectedQty,
            dailyStoresQty,
            accumInspected,
            accumStored,
            remainingQty: totalQty - accumInspected,
            status,
            date,
            loggedAt: firebase.database.ServerValue.TIMESTAMP
        });
    }

    alert("✅ Inspection Entry Saved Successfully!");
    e.target.reset();

    const articleRows = document.getElementById('article-color-rows');
    if (articleRows) {
        articleRows.innerHTML = `
            <div class="article-row">
                <input type="text" class="item-article" placeholder="Article Specs">
                <input type="text" class="item-color" placeholder="Color">
                <input type="number" class="item-qty" placeholder="Qty">
            </div>
        `;
    }
    toggleCheckTypeFields();
    loadData();
}

// Ownership Control & Status Updates
function updateStatus(key, newStatus, recordOwnerId) {
    if (currentUserRole !== 'admin' && currentUser.uid !== recordOwnerId) {
        alert("🔒 Access Denied: You can only view this record. Only the user who created it can edit it.");
        return;
    }

    if (confirm(`Are you sure you want to change status to ${newStatus}?`)) {
        rtdb.ref('inspection_logs/' + key).update({
            status: newStatus
        }).then(() => {
            alert("✅ Status Updated Successfully!");
            loadData();
        }).catch((err) => {
            alert("❌ Update Failed: " + err.message);
        });
    }
}

// Load Data Function (Renders Tables)
function loadData() {
    const tbody20 = document.getElementById('tableBody20');
    const tbody100 = document.getElementById('tableBody100');
    const searchElem = document.getElementById('searchPO');
    const searchQuery = searchElem ? searchElem.value.toLowerCase().trim() : '';

    if (tbody20) tbody20.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    if (tbody100) tbody100.innerHTML = '<tr><td colspan="10" style="text-align:center;">Loading...</td></tr>';

    const selectedDate = document.getElementById('filterDate') ? document.getElementById('filterDate').value : '';
    const headerDateElem = document.getElementById('pdf-date-header');
    if (headerDateElem) headerDateElem.innerText = `Date: ${selectedDate}`;

    rtdb.ref('inspection_logs').once('value').then((snapshot) => {
        let html20 = '';
        let html100 = '';

        if (!snapshot.exists()) {
            if (tbody20) tbody20.innerHTML = '<tr><td colspan="6" style="text-align:center;">No entries found.</td></tr>';
            if (tbody100) tbody100.innerHTML = '<tr><td colspan="10" style="text-align:center;">No entries found.</td></tr>';
            return;
        }

        snapshot.forEach((childSnap) => {
            const key = childSnap.key;
            const data = childSnap.val();

            // Search Query Filter Logic
            if (searchQuery === '') {
                if (data.date !== selectedDate) return;

                if (currentUserRole !== 'admin' && data.userId !== currentUser.uid) {
                    return; 
                }
            } else {
                const poMatch = data.poNumber && data.poNumber.toLowerCase().includes(searchQuery);
                const articleMatch = data.articleDetails && data.articleDetails.toLowerCase().includes(searchQuery);
                if (!poMatch && !articleMatch) return;
            }

            let badgeClass = data.status === 'OK' ? 'badge-ok' : (data.status === 'HOLD' ? 'badge-hold' : 'badge-reject');
            
            const isOwner = (currentUser && currentUser.uid === data.userId) || (currentUserRole === 'admin');

            let statusCell = `<span class="badge ${badgeClass}">${data.status}</span>`;

            if (data.status === 'HOLD') {
                if (isOwner) {
                    statusCell += `
                        <div class="no-print" style="margin-top:4px;">
                            <button onclick="updateStatus('${key}', 'OK', '${data.userId}')" style="background:#10b981; color:#fff; border:none; padding:2px 5px; font-size:10px; border-radius:3px; cursor:pointer;">OK</button>
                            <button onclick="updateStatus('${key}', 'REJECT', '${data.userId}')" style="background:#ef4444; color:#fff; border:none; padding:2px 5px; font-size:10px; border-radius:3px; cursor:pointer;">REJECT</button>
                        </div>
                    `;
                } else {
                    statusCell += ` <small class="no-print" style="color:var(--text-muted); font-size:9px; display:block;">🔒 View Only</small>`;
                }
            }

            if (data.checkType === '100%') {
                html100 += `
                    <tr>
                        <td><strong>${data.poNumber || ''}</strong></td>
                        <td>${data.articleDetails || ''}</td>
                        <td>${data.color || ''}</td>
                        <td>${data.totalQty || 0}</td>
                        <td>${data.dailyInspectedQty || 0}</td>
                        <td style="color:#2563eb; font-weight:bold;">${data.accumInspected || 0}</td>
                        <td style="color:#ef4444; font-weight:bold;">${(data.remainingQty < 0 || isNaN(data.remainingQty)) ? 0 : data.remainingQty}</td>
                        <td>${data.dailyStoresQty || 0} (${data.accumStored || 0})</td>
                        <td><small style="color:#64748b;">${data.userName || 'User'}</small></td>
                        <td>${statusCell}</td>
                    </tr>
                `;
            } else {
                html20 += `
                    <tr>
                        <td><strong>${data.poNumber || ''}</strong></td>
                        <td>${data.articleDetails || ''}</td>
                        <td>${data.color || ''}</td>
                        <td>${data.totalQty || 0}</td>
                        <td><small style="color:#64748b;">${data.userName || 'User'}</small></td>
                        <td>${statusCell}</td>
                    </tr>
                `;
            }
        });

        if (tbody20) tbody20.innerHTML = html20 || '<tr><td colspan="6" style="text-align:center;">No 20% records found.</td></tr>';
        if (tbody100) tbody100.innerHTML = html100 || '<tr><td colspan="10" style="text-align:center;">No 100% records found.</td></tr>';

    }).catch((err) => {
        console.error("Data Load Error:", err);
        if (tbody20) tbody20.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error loading data</td></tr>';
        if (tbody100) tbody100.innerHTML = '<tr><td colspan="10" style="text-align:center; color:red;">Error loading data</td></tr>';
    }); 
}

