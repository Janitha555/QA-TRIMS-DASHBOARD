let currentUser = null;
let currentUserRole = "operator";

// Default Date එක Today ලෙස සැකසීම
document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];

// Firebase Auth State Listener
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';

        rtdb.ref('users/' + user.uid).once('value').then((snapshot) => {
            const userData = snapshot.val();
            
            if ((userData && userData.role === 'admin') || user.email.includes('admin')) {
                currentUserRole = 'admin';
            } else {
                currentUserRole = 'operator';
            }

            updateUserUI(userData ? userData.name : user.email.split('@')[0], userData ? userData.photoURL : null);

            if (currentUserRole === 'admin') {
                document.getElementById('master-admin-panel').style.display = 'block';
                loadSystemUsers();
            } else {
                document.getElementById('master-admin-panel').style.display = 'none';
            }

            loadData();
        }).catch(() => {
            if (user.email.includes('admin')) {
                currentUserRole = 'admin';
                document.getElementById('master-admin-panel').style.display = 'block';
                loadSystemUsers();
            }
            updateUserUI(user.email.split('@')[0], null);
            loadData();
        });

    } else {
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-screen').style.display = 'none';
    }
});

// Login Handler
function handleLogin(e) {
    e.preventDefault();
    const userInput = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const errDiv = document.getElementById('login-error');
    errDiv.innerText = 'Authenticating...';

    const constructedEmail = userInput.includes('@') ? userInput : `${userInput}@trims.com`;

    auth.signInWithEmailAndPassword(constructedEmail, pass)
        .then(() => errDiv.innerText = '')
        .catch(() => errDiv.innerText = "Error: Invalid Credentials");
}

// Logout Handler
function handleLogout() {
    auth.signOut();
}

// User UI updates (Navbar)
function updateUserUI(name, photo) {
    document.getElementById('nav-username').innerText = name || "User";
    document.getElementById('nav-role').innerText = currentUserRole;
    if (photo) document.getElementById('nav-avatar').src = photo;
}

// ✨ Register New User Function (Admin එකෙන් අලුත් Users ලා එකතු කිරීම)
async function handleCreateUser(e) {
    e.preventDefault();
    
    const name = document.getElementById('new-user-name').value.trim();
    const userInput = document.getElementById('new-user-email').value.trim();
    const pass = document.getElementById('new-user-pass').value;

    const email = userInput.includes('@') ? userInput : `${userInput}@trims.com`;

    try {
        // Secondary app එකක් හරහා Admin Logout වීම වළක්වා ගනිමින් අලුත් User සෑදීම
        let secondaryApp = firebase.apps.length > 1 ? firebase.apps[1] : firebase.initializeApp(firebaseConfig, "SecondaryApp");

        const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        const newUser = userCredential.user;

        // Database එකේ user details save කිරීම
        await rtdb.ref('users/' + newUser.uid).set({
            name: name,
            email: email,
            role: 'operator',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        // Secondary session එක ක්ලියර් කිරීම
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
    
    if (select) select.innerHTML = `<option value="ALL">Show All Users Data</option>`;
    if (userListUI) userListUI.innerHTML = '';

    rtdb.ref('users').once('value').then((snapshot) => {
        snapshot.forEach((childSnap) => {
            const uid = childSnap.key;
            const data = childSnap.val();
            if (select) select.innerHTML += `<option value="${uid}">${data.name || 'User'} (${data.email || 'No Email'})</option>`;
            if (userListUI) userListUI.innerHTML += `<li style="padding: 4px 0; border-bottom: 1px solid #f1f5f9;">👤 <strong>${data.name || 'User'}</strong> - <span class="badge badge-role">${data.role || 'operator'}</span></li>`;
        });
    });
}

// Dynamic Article/Color Row Add for 20% Inspection
function addArticleColorRow() {
    const container = document.getElementById('article-color-rows');
    const newRow = document.createElement('div');
    newRow.className = 'article-row';
    newRow.innerHTML = `
        <input type="text" class="item-article" placeholder="Article Specs" required>
        <input type="text" class="item-color" placeholder="Color" required>
        <input type="number" class="item-qty" placeholder="Qty" required>
        <button type="button" class="btn-remove-row" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(newRow);
}

// 100% / 20% Type Change Listener
function toggleCheckTypeFields() {
    const type = document.getElementById('checkType').value;
    const po = document.getElementById('poNumber').value.trim();
    const hundredFields = document.getElementById('hundred-percent-fields');
    const dynamicArticleContainer = document.getElementById('dynamic-article-container');

    if (type === '100%') {
        hundredFields.style.display = 'block';
        dynamicArticleContainer.style.display = 'none';
        if (po !== '' && typeof checkExistingPOQty === "function") checkExistingPOQty(po);
    } else {
        hundredFields.style.display = 'none';
        dynamicArticleContainer.style.display = 'block';
    }
}

// Save Entry (Supports Dynamic Multi Articles & Owner Info)
async function handleSaveRecord(e) {
    e.preventDefault();
    const poNumber = document.getElementById('poNumber').value.trim();
    const checkType = document.getElementById('checkType').value;
    const status = document.getElementById('status').value;
    const date = document.getElementById('filterDate').value;

    let userName = currentUser.email;
    try {
        const userSnap = await rtdb.ref('users/' + currentUser.uid).once('value');
        if (userSnap.exists() && userSnap.val().name) userName = userSnap.val().name;
    } catch (e) {}

    if (checkType === '20%') {
        const articleInputs = document.querySelectorAll('.item-article');
        const colorInputs = document.querySelectorAll('.item-color');
        const qtyInputs = document.querySelectorAll('.item-qty');

        for (let i = 0; i < articleInputs.length; i++) {
            const articleDetails = articleInputs[i].value;
            const color = colorInputs[i].value;
            const totalQty = Number(qtyInputs[i].value) || 0;

            const newLogRef = rtdb.ref('inspection_logs').push();
            await newLogRef.set({
                userId: currentUser.uid,
                userName: currentUserRole === 'admin' ? `${userName} (Admin)` : userName,
                poNumber,
                articleDetails,
                color,
                checkType,
                totalQty,
                status,
                date,
                loggedAt: firebase.database.ServerValue.TIMESTAMP
            });
        }
    } else {
        let totalQty = Number(document.getElementById('totalQty').value) || 0;
        let dailyInspectedQty = Number(document.getElementById('dailyInspectedQty').value) || 0;
        let dailyStoresQty = Number(document.getElementById('dailyStoresQty').value) || 0;
        const articleDetails = document.getElementById('singleArticleDetails').value;
        const color = document.getElementById('singleColor').value;

        let accumInspected = 0;
        let accumStored = 0;

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
            userName: currentUserRole === 'admin' ? `${userName} (Admin)` : userName,
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

    alert("Inspection Entry Saved Successfully!");
    e.target.reset();
    
    // Reset Dynamic Rows
    document.getElementById('article-color-rows').innerHTML = `
        <div class="article-row">
            <input type="text" class="item-article" placeholder="Article Specs" required>
            <input type="text" class="item-color" placeholder="Color" required>
            <input type="number" class="item-qty" placeholder="Qty" required>
        </div>
    `;
    toggleCheckTypeFields();
    loadData();
}

// Ownership Control: Only Owner/Admin can Change Status
function updateStatus(key, newStatus, recordOwnerId) {
    if (currentUserRole !== 'admin' && currentUser.uid !== recordOwnerId) {
        alert("🔒 Access Denied: You can only view this record. Only the user who created it can edit it.");
        return;
    }

    if (confirm(`Are you sure you want to change status to ${newStatus}?`)) {
        rtdb.ref('inspection_logs/' + key).update({
            status: newStatus
        }).then(() => {
            alert("Status Updated Successfully!");
            loadData();
        });
    }
}

// Load Data: Default එකේදී තමන්ගේ Data විතරක් පෙන්වන අතර, Search කළ විට පමණක් වෙනත් Users ලාගේ Data පෙන්වයි.
// Load Data: Default view එකේදී 20% සහ 100% දෙකේම තමන්ගේ Data පමණක් පෙන්වන අතර, Search කළ විට පමණක් වෙනත් අයට අයත් Data පෙන්වයි.
function loadData() {
    const tbody20 = document.getElementById('tableBody20');
    const tbody100 = document.getElementById('tableBody100');
    const searchQuery = document.getElementById('searchPO').value.toLowerCase().trim();
    
    tbody20.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    tbody100.innerHTML = '<tr><td colspan="10">Loading...</td></tr>';
    
    const selectedDate = document.getElementById('filterDate').value;
    const headerDateElem = document.getElementById('pdf-date-header');
    if (headerDateElem) headerDateElem.innerText = `Date: ${selectedDate}`;

    rtdb.ref('inspection_logs').once('value').then((snapshot) => {
        tbody20.innerHTML = '';
        tbody100.innerHTML = '';

        if (!snapshot.exists()) {
            tbody20.innerHTML = '<tr><td colspan="6" style="text-align:center;">No entries found.</td></tr>';
            tbody100.innerHTML = '<tr><td colspan="10" style="text-align:center;">No entries found.</td></tr>';
            return;
        }

        snapshot.forEach((childSnap) => {
            const key = childSnap.key;
            const data = childSnap.val();

            // 1. User Filter Logic (Search එකක් නැති විට තමන්ගේ දත්ත පමණි)
            if (searchQuery === '') {
                // දිනය ගැලපෙන්නේ නැත්නම් skip කරන්න
                if (data.date !== selectedDate) return;

                // Operator කෙනෙක් නම්, තමන්ගේ නොවන සියලුම records (20% සහ 100% දෙකම) hide කරන්න
                if (currentUserRole !== 'admin' && data.userId !== currentUser.uid) {
                    return; 
                }
            } else {
                // 2. Search Filter Logic (Search කළ විට PO හෝ Article Spec ගැලපෙන ඕනෑම අයෙකුගේ data පෙන්වයි)
                const poMatch = data.poNumber && data.poNumber.toLowerCase().includes(searchQuery);
                const articleMatch = data.articleDetails && data.articleDetails.toLowerCase().includes(searchQuery);
                if (!poMatch && !articleMatch) return;
            }

            let badgeClass = data.status === 'OK' ? 'badge-ok' : (data.status === 'HOLD' ? 'badge-hold' : 'badge-reject');
            const isOwner = (currentUser.uid === data.userId) || (currentUserRole === 'admin');

            // Status Cell setup with Edit Restrictions
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

            // Tables එකට Data ඇතුළත් කිරීම (100% සහ 20% වෙන් වෙන්ව)
            if (data.checkType === '100%') {
                tbody100.innerHTML += `
                    <tr>
                        <td><strong>${data.poNumber}</strong></td>
                        <td>${data.articleDetails}</td>
                        <td>${data.color}</td>
                        <td>${data.totalQty || 0}</td>
                        <td>${data.dailyInspectedQty || 0}</td>
                        <td style="color:#2563eb; font-weight:bold;">${data.accumInspected || 0}</td>
                        <td style="color:#ef4444; font-weight:bold;">${data.remainingQty < 0 ? 0 : data.remainingQty}</td>
                        <td>${data.dailyStoresQty || 0} (${data.accumStored || 0})</td>
                        <td><small style="color:#64748b;">${data.userName || 'User'}</small></td>
                        <td>${statusCell}</td>
                    </tr>
                `;
            } else {
                tbody20.innerHTML += `
                    <tr>
                        <td><strong>${data.poNumber}</strong></td>
                        <td>${data.articleDetails}</td>
                        <td>${data.color}</td>
                        <td>${data.totalQty || 0}</td>
                        <td><small style="color:#64748b;">${data.userName || 'User'}</small></td>
                        <td>${statusCell}</td>
                    </tr>
                `;
            }
        });

        // Default Image path (GitHub Repository)
const DEFAULT_AVATAR = "https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPO_NAME/main/default.png";

// User Login වූ පසු Default Image එක පෙන්වීම
function updateUserUI(name, photo) {
    document.getElementById('nav-username').innerText = name || "User";
    document.getElementById('nav-role').innerText = currentUserRole;
    
    // photo එකක් නැත්නම් GitHub Default Image එක පෙන්වයි
    document.getElementById('nav-avatar').src = photo || DEFAULT_AVATAR;
}

// Facebook Link එක හරහා Profile Picture එක Update කිරීම
async function setFacebookProfilePicture() {
    const fbLink = prompt("Past your public facebook profile link (Eg: https://www.facebook.com/zuck):");
    if (!fbLink) return;

    try {
        // Facebook URL එකෙන් Username / ID එක වෙන් කරගැනීම
        let username = fbLink.trim().replace(/\/$/, "").split('/').pop();
        
        if (!username) {
            alert("❌ බාල Facebook Link එකකි!");
            return;
        }

        // Facebook Graph API direct image URL එක සෑදීම
        const fbPhotoUrl = `https://graph.facebook.com/${username}/picture?type=large`;

        // Database එකේ Save කිරීම
        await rtdb.ref('users/' + currentUser.uid).update({
            photoURL: fbPhotoUrl
        });

        document.getElementById('nav-avatar').src = fbPhotoUrl;
        alert("✅ Facebook Profile Picture එක සාර්ථකව Update විය!");

    } catch (error) {
        alert("❌ Error: " + error.message);
    }
}

        if (tbody20.innerHTML === '') tbody20.innerHTML = '<tr><td colspan="6" style="text-align:center;">No 20% records found.</td></tr>';
        if (tbody100.innerHTML === '') tbody100.innerHTML = '<tr><td colspan="10" style="text-align:center;">No 100% records found.</td></tr>';
    });
}
