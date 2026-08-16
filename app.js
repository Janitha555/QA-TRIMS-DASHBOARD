let currentUser = null;
let currentUserRole = "operator";

document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];

// Auth State Monitor (Auto Syncs Profile & Handles Master Dashboard Unlock)
auth.onAuthStateChanged((user) => {
    if (user) {
        currentUser = user;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';

        // Check DB for Admin Profile
        rtdb.ref('users/' + user.uid).once('value').then((snapshot) => {
            const userData = snapshot.val();
            
            // Check if user is admin
            if ((userData && userData.role === 'admin') || user.email.includes('admin')) {
                currentUserRole = 'admin';
            } else {
                currentUserRole = 'operator';
            }

            updateUserUI(userData ? userData.name : user.email.split('@')[0], userData ? userData.photoURL : null);

            // Toggle Master Admin Panel
            if (currentUserRole === 'admin') {
                document.getElementById('master-admin-panel').style.display = 'block';
                loadSystemUsers();
            } else {
                document.getElementById('master-admin-panel').style.display = 'none';
            }

            loadData();
        }).catch((err) => {
            console.error("Profile Fetch Error:", err);
            // Fallback: Default to admin if email contains admin
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
async function handleLogin(e) {
    e.preventDefault();
    const userInput = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    const errDiv = document.getElementById('login-error');
    errDiv.innerText = 'Authenticating...';

    const constructedEmail = userInput.includes('@') ? userInput : `${userInput}@trims.com`;

    try {
        await auth.signInWithEmailAndPassword(constructedEmail, pass);
        errDiv.innerText = '';
    } catch (err) {
        errDiv.innerText = "Error: Invalid Credentials";
    }
}

function handleLogout() {
    auth.signOut();
}

function updateUserUI(name, photo) {
    document.getElementById('nav-username').innerText = name || "User";
    document.getElementById('nav-role').innerText = currentUserRole;
    if (photo) document.getElementById('nav-avatar').src = photo;
}

// Master Admin: Load Users List and Dropdown Filter
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

// Master Admin: Register New Normal Operator
async function handleCreateUser(e) {
    e.preventDefault();
    const name = document.getElementById('new-user-name').value;
    const userInput = document.getElementById('new-user-email').value.trim();
    const pass = document.getElementById('new-user-pass').value;
    const msg = document.getElementById('reg-msg');
    msg.innerText = 'Registering User...';

    const email = userInput.includes('@') ? userInput : `${userInput}@trims.com`;

    try {
        const secondaryApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
        const userCred = await secondaryApp.auth().createUserWithEmailAndPassword(email, pass);
        
        await rtdb.ref('users/' + userCred.user.uid).set({
            name: name,
            email: email,
            role: 'operator',
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        secondaryApp.delete();
        msg.style.color = 'green';
        msg.innerText = "Operator Account Created Successfully!";
        e.target.reset();
        loadSystemUsers();
    } catch (err) {
        msg.style.color = 'red';
        msg.innerText = "Failed: " + err.message;
    }
}

// Load PO Logs
function loadData() {
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '<tr><td colspan="7">Loading Records...</td></tr>';
    
    const selectedDate = document.getElementById('filterDate').value;
    const logsRef = rtdb.ref('inspection_logs');

    logsRef.orderByChild('date').equalTo(selectedDate).once('value').then((snapshot) => {
        tbody.innerHTML = '';
        
        if (!snapshot.exists()) {
            tbody.innerHTML = '<tr><td colspan="7">No entries logged for this date.</td></tr>';
            return;
        }

        const masterUserFilter = document.getElementById('master-user-select') ? document.getElementById('master-user-select').value : 'ALL';

        snapshot.forEach((childSnap) => {
            const data = childSnap.val();

            if (currentUserRole !== 'admin' && data.userId !== currentUser.uid) {
                return;
            }

            if (currentUserRole === 'admin' && masterUserFilter !== 'ALL' && data.userId !== masterUserFilter) {
                return;
            }

            let badgeClass = data.status === 'OK' ? 'badge-ok' : (data.status === 'HOLD' ? 'badge-hold' : 'badge-reject');
            let formattedTime = data.loggedAt ? new Date(data.loggedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

            tbody.innerHTML += `
                <tr>
                    <td><strong>${data.userName || 'Unknown'}</strong></td>
                    <td>${data.date} <span style="font-size:10px; color:var(--text-muted);">${formattedTime}</span></td>
                    <td><strong>${data.poNumber}</strong></td>
                    <td>${data.articleDetails}</td>
                    <td>${data.color}</td>
                    <td>${data.totalQty}</td>
                    <td><span class="badge ${badgeClass}">${data.status}</span></td>
                </tr>
            `;
        });

        if (tbody.innerHTML === '') {
            tbody.innerHTML = '<tr><td colspan="7">No matching records found.</td></tr>';
        }
    });
}

// Save Inspection Entry
async function handleSaveRecord(e) {
    e.preventDefault();
    const poNumber = document.getElementById('poNumber').value;
    const articleDetails = document.getElementById('articleDetails').value;
    const color = document.getElementById('color').value;
    const totalQty = document.getElementById('totalQty').value;
    const status = document.getElementById('status').value;
    const date = document.getElementById('filterDate').value;

    let userName = currentUser.email;
    try {
        const userSnap = await rtdb.ref('users/' + currentUser.uid).once('value');
        if (userSnap.exists() && userSnap.val().name) {
            userName = userSnap.val().name;
        }
    } catch (e) {}

    const newLogRef = rtdb.ref('inspection_logs').push();
    await newLogRef.set({
        userId: currentUser.uid,
        userName: currentUserRole === 'admin' ? `${userName} (Admin)` : userName,
        poNumber,
        articleDetails,
        color,
        totalQty,
        status,
        date,
        loggedAt: firebase.database.ServerValue.TIMESTAMP
    });

    alert("Inspection Entry Saved Successfully!");
    e.target.reset();
    loadData();
}
