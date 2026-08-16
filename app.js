let currentUser = null;
let currentUserRole = "operator";

document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];

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
        }).catch((err) => {
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

function handleLogout() {
    auth.signOut();
}

function updateUserUI(name, photo) {
    document.getElementById('nav-username').innerText = name || "User";
    document.getElementById('nav-role').innerText = currentUserRole;
    if (photo) document.getElementById('nav-avatar').src = photo;
}

function loadSystemUsers() {
    const select = document.getElementById('master-user-select');
    const userListUI = document.getElementById('users-list');
    select.innerHTML = `<option value="ALL">Show All Users Data</option>`;
    userListUI.innerHTML = '';

    rtdb.ref('users').once('value').then((snapshot) => {
        snapshot.forEach((childSnap) => {
            const uid = childSnap.key;
            const data = childSnap.val();
            select.innerHTML += `<option value="${uid}">${data.name || 'User'} (${data.email || 'No Email'})</option>`;
            userListUI.innerHTML += `<li style="padding: 3px 0; border-bottom: 1px solid #f1f5f9;">👤 <strong>${data.name || 'User'}</strong> - <span class="badge badge-role">${data.role || 'operator'}</span></li>`;
        });
    });
}

// 100% / 20% Type Change Listener
function toggleCheckTypeFields() {
    const type = document.getElementById('checkType').value;
    const po = document.getElementById('poNumber').value.trim();
    const hundredFields = document.getElementById('hundred-percent-fields');

    if (type === '100%') {
        hundredFields.style.display = 'block';
        if (po !== '') {
            checkExistingPOQty(po);
        }
    } else {
        hundredFields.style.display = 'none';
    }
}

// Check PO for 100% Inspection Logic (Lock Total Qty if already existing)
async function checkExistingPOQty(poNumber) {
    const totalQtyInput = document.getElementById('totalQty');
    
    const snapshot = await rtdb.ref('inspection_logs').orderByChild('poNumber').equalTo(poNumber).once('value');
    
    let existingTotal = null;
    let totalInspected = 0;
    let totalStored = 0;

    snapshot.forEach(child => {
        const d = child.val();
        if (d.checkType === '100%') {
            if (d.totalQty) existingTotal = d.totalQty;
            totalInspected += Number(d.dailyInspectedQty || 0);
            totalStored += Number(d.dailyStoresQty || 0);
        }
    });

    if (existingTotal !== null) {
        totalQtyInput.value = existingTotal;
        totalQtyInput.readOnly = true;
        totalQtyInput.style.backgroundColor = "#e2e8f0";
        document.getElementById('po-calc-info').innerText = `⚠️ Total PO Qty Locked (${existingTotal}). Total Inspected: ${totalInspected}, Remaining: ${existingTotal - totalInspected}`;
    } else {
        totalQtyInput.readOnly = false;
        totalQtyInput.style.backgroundColor = "#ffffff";
        document.getElementById('po-calc-info').innerText = ``;
    }
}

// Save Entry with Calculations
async function handleSaveRecord(e) {
    e.preventDefault();
    const poNumber = document.getElementById('poNumber').value.trim();
    const articleDetails = document.getElementById('articleDetails').value;
    const color = document.getElementById('color').value;
    const checkType = document.getElementById('checkType').value;
    const status = document.getElementById('status').value;
    const date = document.getElementById('filterDate').value;

    let totalQty = Number(document.getElementById('totalQty').value) || 0;
    let dailyInspectedQty = Number(document.getElementById('dailyInspectedQty').value) || 0;
    let dailyStoresQty = Number(document.getElementById('dailyStoresQty').value) || 0;

    // Check Previous History for 100% Math
    let accumInspected = 0;
    let accumStored = 0;

    if (checkType === '100%') {
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
    }

    let userName = currentUser.email;
    try {
        const userSnap = await rtdb.ref('users/' + currentUser.uid).once('value');
        if (userSnap.exists() && userSnap.val().name) userName = userSnap.val().name;
    } catch (e) {}

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

    alert("Record Saved Successfully!");
    e.target.reset();
    toggleCheckTypeFields();
    loadData();
}

// Update HOLD Status Logic (Allow Operator to change HOLD to OK/REJECT)
function updateStatus(key, newStatus) {
    if (confirm(`Are you sure you want to change status to ${newStatus}?`)) {
        rtdb.ref('inspection_logs/' + key).update({
            status: newStatus
        }).then(() => {
            alert("Status Updated Successfully!");
            loadData();
        });
    }
}

// Load Data to 2 Separate Tables (20% and 100%)
function loadData() {
    const tbody20 = document.getElementById('tableBody20');
    const tbody100 = document.getElementById('tableBody100');
    
    tbody20.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    tbody100.innerHTML = '<tr><td colspan="9">Loading...</td></tr>';
    
    const selectedDate = document.getElementById('filterDate').value;
    document.getElementById('pdf-date-header').innerText = `Date: ${selectedDate}`;

    rtdb.ref('inspection_logs').orderByChild('date').equalTo(selectedDate).once('value').then((snapshot) => {
        tbody20.innerHTML = '';
        tbody100.innerHTML = '';
        
        if (!snapshot.exists()) {
            tbody20.innerHTML = '<tr><td colspan="6" style="text-align:center;">No 20% Inspection entries logged.</td></tr>';
            tbody100.innerHTML = '<tr><td colspan="9" style="text-align:center;">No 100% Inspection entries logged.</td></tr>';
            return;
        }

        const masterUserFilter = document.getElementById('master-user-select') ? document.getElementById('master-user-select').value : 'ALL';

        snapshot.forEach((childSnap) => {
            const key = childSnap.key;
            const data = childSnap.val();

            if (currentUserRole !== 'admin' && data.userId !== currentUser.uid) return;
            if (currentUserRole === 'admin' && masterUserFilter !== 'ALL' && data.userId !== masterUserFilter) return;

            let badgeClass = data.status === 'OK' ? 'badge-ok' : (data.status === 'HOLD' ? 'badge-hold' : 'badge-reject');
            
            // Status Action for Operators (If HOLD, show dropdown/buttons)
            let statusCell = `<span class="badge ${badgeClass}">${data.status}</span>`;
            if (data.status === 'HOLD' && (currentUserRole === 'admin' || data.userId === currentUser.uid)) {
                statusCell += `
                    <div class="no-print" style="margin-top:4px;">
                        <button onclick="updateStatus('${key}', 'OK')" style="background:#10b981; color:#fff; border:none; padding:2px 5px; font-size:10px; border-radius:3px; cursor:pointer;">OK</button>
                        <button onclick="updateStatus('${key}', 'REJECT')" style="background:#ef4444; color:#fff; border:none; padding:2px 5px; font-size:10px; border-radius:3px; cursor:pointer;">REJECT</button>
                    </div>
                `;
            }

            // Populate Tables based on Check Type
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
                        <td>${statusCell}</td>
                    </tr>
                `;
            }
        });

        if (tbody20.innerHTML === '') tbody20.innerHTML = '<tr><td colspan="5" style="text-align:center;">No 20% records.</td></tr>';
        if (tbody100.innerHTML === '') tbody100.innerHTML = '<tr><td colspan="9" style="text-align:center;">No 100% records.</td></tr>';
    });
}
