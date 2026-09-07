// ==========================================
// Global Variables & Configuration
// ==========================================
let currentUser = null;
let currentUserRole = "operator";

const DEFAULT_AVATAR = "https://raw.githubusercontent.com/Janitha555/QA-TRIMS-DASHBOARD/main/profile.png";

const todayStr = new Date().toISOString().split('T')[0];
if (document.getElementById('filterDate')) {
    document.getElementById('filterDate').value = todayStr;
}
if (document.getElementById('receivedDate')) {
    document.getElementById('receivedDate').value = todayStr;
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

function setElementDisplay(id, displayType) {
    const el = document.getElementById(id);
    if (el) el.style.display = displayType;
}

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

function handleLogout() {
    auth.signOut();
}

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

        alert("Operator created successfully.");

        e.target.reset();
        loadSystemUsers();

    } catch (error) {
        console.error("Error creating user:", error);
        alert("Error Registering User: " + error.message);
    }
}

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
// Profile Image Handling
// ==========================================

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert("Please select a valid Image file.");
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
                    alert("Profile Picture updated successfully.");
                }).catch((err) => {
                    alert("Save Error: " + err.message);
                });
            }
        };
    };

    reader.readAsDataURL(file);
}

// ==========================================
// Dynamic Form Row Handlers
// ==========================================

function addArticleColorRow(type) {
    if (type === '10%') {
        const container = document.getElementById('article-color-rows-10');
        if (!container) return;
        const newRow = document.createElement('div');
        newRow.className = 'article-row';
        newRow.style.display = 'flex';
        newRow.style.gap = '5px';
        newRow.style.marginBottom = '8px';
        newRow.innerHTML = `
            <input type="text" class="item-article-10" placeholder="Article Specs" style="flex:1;">
            <input type="text" class="item-color-10" placeholder="Color" style="flex:1;">
            <input type="number" class="item-qty-10" placeholder="Qty" style="flex:1;">
            <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">✕</button>
        `;
        container.appendChild(newRow);
    } else {
        const container = document.getElementById('article-color-rows-100');
        if (!container) return;
        const newRow = document.createElement('div');
        newRow.className = 'article-row-100';
        newRow.style.display = 'flex';
        newRow.style.gap = '5px';
        newRow.style.marginBottom = '8px';
        newRow.innerHTML = `
            <input type="text" class="item-article-100" placeholder="Article Specs" style="flex:1;">
            <input type="text" class="item-color-100" placeholder="Color" style="flex:1;">
            <input type="number" class="item-fullqty-100" placeholder="Full Qty" style="flex:1;">
            <input type="number" class="item-chkqty-100" placeholder="Checked" style="flex:1;">
            <input type="number" class="item-storeqty-100" placeholder="Stores" style="flex:1;">
            <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">✕</button>
        `;
        container.appendChild(newRow);
    }
}

function toggleTrimCategoryFields() {
    const category = document.getElementById('trimCategory')?.value || 'General';

    if (category === 'Thread') {
        setElementDisplay('po-container', 'none');
        setElementDisplay('thread-fields', 'block');
        setElementDisplay('dynamic-article-container-10', 'none');
        setElementDisplay('dynamic-article-container-100', 'none');
    } else {
        setElementDisplay('po-container', 'block');
        setElementDisplay('thread-fields', 'none');
        toggleCheckTypeFields();
    }
}

function toggleCheckTypeFields() {
    const checkTypeElem = document.getElementById('checkType');
    if (!checkTypeElem) return;

    const type = checkTypeElem.value;
    const trimCategory = document.getElementById('trimCategory')?.value || 'General';

    if (trimCategory === 'Thread') {
        setElementDisplay('dynamic-article-container-10', 'none');
        setElementDisplay('dynamic-article-container-100', 'none');
    } else {
        setElementDisplay('dynamic-article-container-10', type === '10%' ? 'block' : 'none');
        setElementDisplay('dynamic-article-container-100', type === '100%' ? 'block' : 'none');
    }
}

// ==========================================
// Record Saving Logic
// ==========================================

async function handleSaveRecord(e) {
    e.preventDefault();
    if (!currentUser) {
        alert("User session expired. Please login again.");
        return;
    }

    const checkType = document.getElementById('checkType') ? document.getElementById('checkType').value : '10%';
    const trimCategory = document.getElementById('trimCategory') ? document.getElementById('trimCategory').value : 'General';
    const status = document.getElementById('status') ? document.getElementById('status').value : 'NON-CHECK';
    const receivedDate = document.getElementById('receivedDate') ? document.getElementById('receivedDate').value : todayStr;
    const inspectedDate = (status === 'NON-CHECK') ? '-' : todayStr;
    let poNumber = document.getElementById('poNumber') ? document.getElementById('poNumber').value.trim() : '';

    let userName = currentUser.email || 'User';
    try {
        const userSnap = await rtdb.ref('users/' + currentUser.uid).once('value');
        if (userSnap.exists() && userSnap.val().name) userName = userSnap.val().name;
    } catch (e) {
        console.warn("User fetch error:", e);
    }

    const formattedUserName = currentUserRole === 'admin' ? `${userName} (Admin)` : userName;

    // THREAD SAVE
    if (trimCategory === 'Thread') {
        const shade = document.getElementById('threadShade')?.value.trim() || '';
        const coneQty = Number(document.getElementById('threadConeQty')?.value) || 0;

        const newLogRef = rtdb.ref('inspection_logs').push();
        await newLogRef.set({
            userId: currentUser.uid,
            userName: formattedUserName,
            trimCategory: 'Thread',
            poNumber: 'N/A (Thread)',
            shade: shade,
            coneQty: coneQty,
            checkType: checkType,
            status: status,
            receivedDate: receivedDate,
            date: inspectedDate,
            loggedAt: firebase.database.ServerValue.TIMESTAMP
        });

    } 
    // 10% INSPECTION SAVE
    else if (checkType === '10%') {
        if (!poNumber) {
            alert("Please enter a PO Number.");
            return;
        }

        const articleInputs = document.querySelectorAll('.item-article-10');
        const colorInputs = document.querySelectorAll('.item-color-10');
        const qtyInputs = document.querySelectorAll('.item-qty-10');

        const savePromises = [];

        for (let i = 0; i < articleInputs.length; i++) {
            const articleDetails = articleInputs[i].value.trim();
            const color = colorInputs[i].value.trim();
            const totalQty = Number(qtyInputs[i].value) || 0;

            if (articleDetails || status === 'NON-CHECK') {
                const newLogRef = rtdb.ref('inspection_logs').push();
                const promise = newLogRef.set({
                    userId: currentUser.uid,
                    userName: formattedUserName,
                    trimCategory: 'General',
                    poNumber,
                    articleDetails: articleDetails || 'Pending Inspection',
                    color: color || '-',
                    checkType: '10%',
                    totalQty,
                    status,
                    receivedDate: receivedDate,
                    date: inspectedDate,
                    loggedAt: firebase.database.ServerValue.TIMESTAMP
                });
                savePromises.push(promise);
            }
        }
        await Promise.all(savePromises);

    } 
    // 100% INSPECTION SAVE (DYNAMIC MULTI-ARTICLE)
    else {
        if (!poNumber) {
            alert("Please enter a PO Number.");
            return;
        }

        const articles100 = document.querySelectorAll('.item-article-100');
        const colors100 = document.querySelectorAll('.item-color-100');
        const fullQtys = document.querySelectorAll('.item-fullqty-100');
        const chkQtys = document.querySelectorAll('.item-chkqty-100');
        const storeQtys = document.querySelectorAll('.item-storeqty-100');

        const savePromises = [];

        for (let i = 0; i < articles100.length; i++) {
            const articleDetails = articles100[i].value.trim() || 'Pending Inspection';
            const color = colors100[i].value.trim() || '-';
            const totalQty = Number(fullQtys[i].value) || 0;
            const dailyInspectedQty = Number(chkQtys[i].value) || 0;
            const dailyStoresQty = Number(storeQtys[i].value) || 0;

            let accumInspected = 0;
            let accumStored = 0;

            // Existing Log Calculation per Article
            const snap = await rtdb.ref('inspection_logs')
                .orderByChild('poNumber')
                .equalTo(poNumber)
                .once('value');

            snap.forEach(child => {
                const d = child.val();
                if (d.checkType === '100%' && d.articleDetails === articleDetails && d.color === color) {
                    accumInspected += Number(d.dailyInspectedQty || 0);
                    accumStored += Number(d.dailyStoresQty || 0);
                }
            });

            accumInspected += dailyInspectedQty;
            accumStored += dailyStoresQty;

            const newLogRef = rtdb.ref('inspection_logs').push();
            const promise = newLogRef.set({
                userId: currentUser.uid,
                userName: formattedUserName,
                trimCategory: 'General',
                poNumber,
                articleDetails,
                color,
                checkType: '100%',
                totalQty,
                dailyInspectedQty,
                dailyStoresQty,
                accumInspected,
                accumStored,
                remainingQty: totalQty - accumInspected,
                status,
                receivedDate: receivedDate,
                date: inspectedDate,
                loggedAt: firebase.database.ServerValue.TIMESTAMP
            });
            savePromises.push(promise);
        }

        await Promise.all(savePromises);
    }

    alert("Inspection Entry Saved Successfully!");
    e.target.reset();

    document.getElementById('receivedDate').value = todayStr;
    toggleTrimCategoryFields();
    loadData();
}

// ==========================================
// Update & Edit Mechanics
// ==========================================

function updateStatus(key, newStatus, recordOwnerId) {
    if (currentUserRole !== 'admin' && currentUser.uid !== recordOwnerId) {
        alert("Access Denied: You can only edit your own records.");
        return;
    }

    const currentToday = new Date().toISOString().split('T')[0];

    if (confirm(`Are you sure you want to change status to ${newStatus}?`)) {
        rtdb.ref('inspection_logs/' + key).update({
            status: newStatus,
            date: currentToday
        }).then(() => {
            alert("Status updated successfully!");
            loadData();
        }).catch((err) => {
            alert("Update Failed: " + err.message);
        });
    }
}

// Any Quantities Edit Function
function editQuantities(key, recordOwnerId, curTotal, curDaily, curStores) {
    if (currentUserRole !== 'admin' && currentUser.uid !== recordOwnerId) {
        alert("Access Denied: You can only edit your own records.");
        return;
    }

    const newTotal = prompt("Update Full PO Qty:", curTotal);
    if (newTotal === null) return;

    const newDaily = prompt("Update Today Inspected Qty:", curDaily);
    if (newDaily === null) return;

    const newStores = prompt("Update Today Delivered to Stores Qty:", curStores);
    if (newStores === null) return;

    const parsedTotal = Number(newTotal) || 0;
    const parsedDaily = Number(newDaily) || 0;
    const parsedStores = Number(newStores) || 0;

    rtdb.ref('inspection_logs/' + key).once('value').then(snapshot => {
        const data = snapshot.val();
        if (!data) return;

        let accumInspected = (data.accumInspected - data.dailyInspectedQty) + parsedDaily;
        let accumStored = (data.accumStored - data.dailyStoresQty) + parsedStores;

        rtdb.ref('inspection_logs/' + key).update({
            totalQty: parsedTotal,
            dailyInspectedQty: parsedDaily,
            dailyStoresQty: parsedStores,
            accumInspected: accumInspected,
            accumStored: accumStored,
            remainingQty: parsedTotal - accumInspected
        }).then(() => {
            alert("Quantities updated successfully!");
            loadData();
        }).catch(err => {
            alert("Update Error: " + err.message);
        });
    });
}

// ==========================================
// Data Retrieval Logic
// ==========================================

function loadData() {
    const tbody20 = document.getElementById('tableBody20');
    const tbody100 = document.getElementById('tableBody100');
    const searchElem = document.getElementById('searchPO');
    const searchQuery = searchElem ? searchElem.value.toLowerCase().trim() : '';

    if (tbody20) tbody20.innerHTML = '<tr><td colspan="8" style="text-align:center;">Loading...</td></tr>';
    if (tbody100) tbody100.innerHTML = '<tr><td colspan="13" style="text-align:center;">Loading...</td></tr>';

    const selectedDate = document.getElementById('filterDate') ? document.getElementById('filterDate').value : '';
    const headerDateElem = document.getElementById('pdf-date-header');
    if (headerDateElem) headerDateElem.innerText = `Date: ${selectedDate}`;

    rtdb.ref('inspection_logs').once('value').then((snapshot) => {
        let html10 = '';
        let html100 = '';

        if (!snapshot.exists()) {
            if (tbody20) tbody20.innerHTML = '<tr><td colspan="8" style="text-align:center;">No entries found.</td></tr>';
            if (tbody100) tbody100.innerHTML = '<tr><td colspan="13" style="text-align:center;">No entries found.</td></tr>';
            return;
        }

        snapshot.forEach((childSnap) => {
            const key = childSnap.key;
            const data = childSnap.val();

            if (searchQuery === '') {
                const recDate = data.receivedDate || '';
                const inspDate = data.date || '';

                if (recDate !== selectedDate && inspDate !== selectedDate) return;

                if (currentUserRole !== 'admin' && data.userId !== currentUser.uid) {
                    return; 
                }
            } else {
                const poMatch = data.poNumber && data.poNumber.toLowerCase().includes(searchQuery);
                const articleMatch = data.articleDetails && data.articleDetails.toLowerCase().includes(searchQuery);
                const shadeMatch = data.shade && data.shade.toLowerCase().includes(searchQuery);
                if (!poMatch && !articleMatch && !shadeMatch) return;
            }

            let badgeClass = 'badge-hold';
            if (data.status === 'OK') badgeClass = 'badge-ok';
            else if (data.status === 'REJECT') badgeClass = 'badge-reject';
            else if (data.status === 'NON-CHECK') badgeClass = 'badge-role';

            const isOwner = (currentUser && currentUser.uid === data.userId) || (currentUserRole === 'admin');

            let statusCell = `<span class="badge ${badgeClass}">${data.status}</span>`;

            if (data.status === 'HOLD' || data.status === 'NON-CHECK') {
                if (isOwner) {
                    statusCell += `
                        <div class="no-print" style="margin-top:4px; display:flex; gap:2px;">
                            <button onclick="updateStatus('${key}', 'OK', '${data.userId}')" style="background:#10b981; color:#fff; border:none; padding:2px 5px; font-size:10px; border-radius:3px; cursor:pointer;">OK</button>
                            <button onclick="updateStatus('${key}', 'HOLD', '${data.userId}')" style="background:#f59e0b; color:#fff; border:none; padding:2px 5px; font-size:10px; border-radius:3px; cursor:pointer;">HOLD</button>
                            <button onclick="updateStatus('${key}', 'REJECT', '${data.userId}')" style="background:#ef4444; color:#fff; border:none; padding:2px 5px; font-size:10px; border-radius:3px; cursor:pointer;">REJ</button>
                        </div>
                    `;
                } else {
                    statusCell += ` <small class="no-print" style="color:var(--text-muted); font-size:9px; display:block;">🔒 View Only</small>`;
                }
            }

            const recDateDisp = data.receivedDate || data.date || '-';
            const inspDateDisp = (data.status === 'NON-CHECK') ? 'Pending' : (data.date || '-');

            if (data.checkType === '100%') {
                let actionBtn = '-';
                if (isOwner) {
                    actionBtn = `<button onclick="editQuantities('${key}', '${data.userId}', ${data.totalQty || 0}, ${data.dailyInspectedQty || 0}, ${data.dailyStoresQty || 0})" style="background:#3b82f6; color:#fff; border:none; padding:3px 6px; font-size:10px; border-radius:3px; cursor:pointer;">✏️ Edit Qty</button>`;
                }

                html100 += `
                    <tr>
                        <td><strong>${data.poNumber || ''}</strong></td>
                        <td><small>${recDateDisp}</small></td>
                        <td><small>${inspDateDisp}</small></td>
                        <td>${data.articleDetails || ''}</td>
                        <td>${data.color || ''}</td>
                        <td>${data.totalQty || 0}</td>
                        <td>${data.dailyInspectedQty || 0}</td>
                        <td style="color:#2563eb; font-weight:bold;">${data.accumInspected || 0}</td>
                        <td style="color:#ef4444; font-weight:bold;">${(data.remainingQty < 0 || isNaN(data.remainingQty)) ? 0 : data.remainingQty}</td>
                        <td>${data.dailyStoresQty || 0} (${data.accumStored || 0})</td>
                        <td><small style="color:#64748b;">${data.userName || 'User'}</small></td>
                        <td>${statusCell}</td>
                        <td class="no-print">${actionBtn}</td>
                    </tr>
                `;
            } else {
                if (data.trimCategory === 'Thread') {
                    html10 += `
                        <tr>
                            <td><strong>🧵 Thread</strong></td>
                            <td><small>${recDateDisp}</small></td>
                            <td><small>${inspDateDisp}</small></td>
                            <td>Shade: ${data.shade || 'N/A'}</td>
                            <td>Cone Qty: ${data.coneQty || 0}</td>
                            <td>-</td>
                            <td><small style="color:#64748b;">${data.userName || 'User'}</small></td>
                            <td>${statusCell}</td>
                        </tr>
                    `;
                } else {
                    html10 += `
                        <tr>
                            <td><strong>${data.poNumber || ''}</strong></td>
                            <td><small>${recDateDisp}</small></td>
                            <td><small>${inspDateDisp}</small></td>
                            <td>${data.articleDetails || ''}</td>
                            <td>${data.color || ''}</td>
                            <td>${data.totalQty || 0}</td>
                            <td><small style="color:#64748b;">${data.userName || 'User'}</small></td>
                            <td>${statusCell}</td>
                        </tr>
                    `;
                }
            }
        });

        if (tbody20) tbody20.innerHTML = html10 || '<tr><td colspan="8" style="text-align:center;">No 10% records found.</td></tr>';
        if (tbody100) tbody100.innerHTML = html100 || '<tr><td colspan="13" style="text-align:center;">No 100% records found.</td></tr>';

    }).catch((err) => {
        console.error("Data Load Error:", err);
        if (tbody20) tbody20.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Error loading data</td></tr>';
        if (tbody100) tbody100.innerHTML = '<tr><td colspan="13" style="text-align:center; color:red;">Error loading data</td></tr>';
    }); 
}

