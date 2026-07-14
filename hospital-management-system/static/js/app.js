/* =====================================================================================
   PULSE HMS — FRONTEND APPLICATION LOGIC (FETCH BACKED)
   All operations communicate with the Python/Flask/SQLite server endpoints.
   ===================================================================================== */

let currentPage = 'dashboard';
let currentSession = null;

/* ---------------------------- FORMATTERS ---------------------------- */
function fmtDate(iso){ 
  if(!iso) return '';
  const d = new Date(iso); 
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'}); 
}
function fmtMoney(n){ 
  return '$' + Number(n).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}); 
}

/* ---------------------------- AUTHENTICATION ---------------------------- */
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const errBox = document.getElementById('loginError');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (res.ok && data.ok) {
      errBox.style.display = 'none';
      currentSession = data.user;
      boot();
    } else {
      errBox.textContent = data.message || "Invalid username or password.";
      errBox.style.display = 'block';
    }
  } catch (err) {
    errBox.textContent = "Failed to connect to server. Ensure Flask backend is running.";
    errBox.style.display = 'block';
  }
});

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {
    console.error("Logout error", err);
  }
  currentSession = null;
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('loginForm').reset();
}

document.getElementById('logoutBtn').addEventListener('click', logout);

/* ---------------------------- SIDEBAR & NAV ---------------------------- */
document.querySelectorAll('.navItem[data-page]').forEach(el => {
  el.addEventListener('click', () => { 
    navigate(el.dataset.page); 
    if (window.innerWidth <= 860) {
      document.getElementById('sidebar').classList.remove('open'); 
    }
  });
});

document.getElementById('menuToggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

const ROLE_PAGES = {
  administrator: ['dashboard', 'patients', 'doctors', 'appointments', 'billing', 'pharmacy', 'reports', 'settings'],
  doctor:        ['dashboard', 'patients', 'appointments', 'reports', 'settings'],
  receptionist:  ['dashboard', 'patients', 'appointments', 'billing', 'settings'],
  pharmacist:    ['dashboard', 'pharmacy', 'reports', 'settings']
};

function navigate(page) {
  if (!currentSession) return;
  const allowed = ROLE_PAGES[currentSession.role] || ['dashboard'];
  if (!allowed.includes(page)) page = 'dashboard';
  currentPage = page;
  
  document.querySelectorAll('.navItem[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  render();
}

/* ---------------------------- THEME ---------------------------- */
function applyTheme() {
  const t = localStorage.getItem('hms_theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('themeToggle').innerHTML = t === 'dark' ? 
    '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

document.getElementById('themeToggle').addEventListener('click', () => {
  const cur = localStorage.getItem('hms_theme') || 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('hms_theme', next);
  applyTheme();
  if (currentPage === 'settings') renderSettings();
});

/* ---------------------------- BOOT ---------------------------- */
async function boot() {
  applyTheme();
  
  // Verify session with server if not already stored
  if (!currentSession) {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (res.ok && data.logged_in) {
        currentSession = data.user;
      }
    } catch (err) {
      console.error("Session check error", err);
    }
  }

  if (!currentSession) {
    document.getElementById('app').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    return;
  }

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('sideName').textContent = currentSession.name;
  document.getElementById('sideRole').textContent = currentSession.role;
  
  const initials = currentSession.name
    .replace('Dr. ', '')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('');
  document.getElementById('sideAvatar').textContent = initials;

  // Toggle navigation visibility based on role
  const allowed = ROLE_PAGES[currentSession.role] || ['dashboard'];
  document.querySelectorAll('.navItem[data-page]').forEach(el => {
    el.style.display = allowed.includes(el.dataset.page) ? 'flex' : 'none';
  });

  navigate(allowed.includes('dashboard') ? 'dashboard' : allowed[0]);
  refreshBadges();
  
  // Periodically refresh badges
  if (!window.badgeInterval) {
    window.badgeInterval = setInterval(refreshBadges, 15000);
  }
}

async function refreshBadges() {
  if (!currentSession) return;
  try {
    // 1. Appointments count
    const apptsRes = await fetch('/api/appointments?filter=upcoming');
    if (apptsRes.ok) {
      const appts = await apptsRes.json();
      const el = document.getElementById('apptBadge');
      if (el) el.textContent = appts.length;
    }
    
    // 2. Notifications count
    const notifsRes = await fetch('/api/notifications');
    if (notifsRes.ok) {
      const notifs = await notifsRes.json();
      const el = document.getElementById('notifCount');
      if (el) {
        if (notifs.length > 0) {
          el.textContent = notifs.length > 99 ? '99+' : notifs.length;
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    }
  } catch (err) {
    console.error("Error refreshing badges", err);
  }
}

document.getElementById('notifBell').addEventListener('click', () => {
  if (currentSession && (ROLE_PAGES[currentSession.role] || []).includes('appointments')) {
    navigate('appointments');
  }
});

/* ---------------------------- ROUTER ---------------------------- */
function render() {
  const c = document.getElementById('content');
  c.classList.remove('section-fade');
  void c.offsetWidth; // Trigger reflow to restart animation
  c.classList.add('section-fade');

  switch (currentPage) {
    case 'dashboard': return renderDashboard();
    case 'patients': return renderPatients();
    case 'doctors': return renderDoctors();
    case 'appointments': return renderAppointments();
    case 'billing': return renderBilling();
    case 'pharmacy': return renderPharmacy();
    case 'reports': return renderReports();
    case 'settings': return renderSettings();
  }
}

/* ---------------------------- STATUS PILLS ---------------------------- */
function statusPill(status) {
  const map = {
    admitted: ['green', 'Admitted'], 
    outpatient: ['amber', 'Outpatient'], 
    discharged: ['slate', 'Discharged'],
    upcoming: ['green', 'Upcoming'], 
    completed: ['slate', 'Completed'], 
    cancelled: ['red', 'Cancelled'],
    paid: ['green', 'Paid'], 
    unpaid: ['red', 'Unpaid'],
    available: ['green', 'Available'], 
    'on-leave': ['amber', 'On Leave'], 
    'in-surgery': ['red', 'In Surgery']
  };
  const [cls, label] = map[status] || ['slate', status];
  return `<span class="pill ${cls}">${label}</span>`;
}

/* ---------------------------- DASHBOARD ---------------------------- */
async function renderDashboard() {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading dashboard...</div></div>`;

  try {
    const res = await fetch('/api/dashboard/stats');
    if (!res.ok) throw new Error("Could not load stats");
    const data = await res.json();

    const stats = data.stats;
    const todaysAppts = data.todaysAppts;
    const recentPatients = data.recentPatients;
    const lowStock = data.lowStock;
    const weeklyTrend = data.weeklyTrend;

    const maxW = Math.max(...weeklyTrend.values, 1);

    c.innerHTML = `
      <div class="pageHead">
        <div><div class="eyebrow">Overview</div><h2>Good day, welcome back</h2><p>Here's what's happening across the hospital today, ${fmtDate(new Date())}.</p></div>
        <button class="btn btn-primary" onclick="openApptModal()"><i class="fa-solid fa-plus"></i>&nbsp; New Appointment</button>
      </div>

      <div class="grid statGrid" style="margin-bottom:18px;">
        <div class="card statCard">
          <div class="icoWrap" style="background:var(--teal-600);"><i class="fa-solid fa-bed-pulse"></i></div>
          <b class="val">${stats.totalPatients}</b><span class="lbl">Total Patients</span>
          <span class="trend up"><i class="fa-solid fa-arrow-up"></i> ${stats.admittedPatients} currently admitted</span>
        </div>
        <div class="card statCard">
          <div class="icoWrap" style="background:#3B82F6;"><i class="fa-solid fa-user-doctor"></i></div>
          <b class="val">${stats.totalDoctors}</b><span class="lbl">Active Doctors</span>
          <span class="trend up">${stats.availableDoctors} available now</span>
        </div>
        <div class="card statCard">
          <div class="icoWrap" style="background:var(--coral);"><i class="fa-solid fa-calendar-check"></i></div>
          <b class="val">${stats.todaysApptsCount}</b><span class="lbl">Today's Appointments</span>
          <span class="trend ${stats.upcomingApptsCount ? 'up' : 'down'}">${stats.upcomingApptsCount} upcoming total</span>
        </div>
        <div class="card statCard">
          <div class="icoWrap" style="background:var(--amber);"><i class="fa-solid fa-file-invoice-dollar"></i></div>
          <b class="val">${fmtMoney(stats.revenue)}</b><span class="lbl">Revenue Collected</span>
          <span class="trend down">${stats.unpaidBillsCount} invoices unpaid</span>
        </div>
      </div>

      <div class="grid twoCol">
        <div class="card">
          <div class="cardTitle"><h3>Appointments this week</h3><span>Real-time aggregate data</span></div>
          <div class="barChart">
            ${weeklyTrend.values.map((v, i) => `
              <div class="bar" style="height:${(v / maxW * 100)}%">
                <b>${v}</b><span>${weeklyTrend.labels[i]}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="cardTitle"><h3>Today's schedule</h3><span>${todaysAppts.length} total</span></div>
          <div class="timeline">
            ${todaysAppts.length ? todaysAppts.map(a => `
              <div class="tItem">
                <div class="tTime">${a.time}</div>
                <div class="tDot"></div>
                <div class="tBody"><b>${a.patient_name}</b><span>${a.doctor_name} &middot; ${a.reason}</span></div>
              </div>`).join('') : `
              <div class="emptyState" style="padding:20px;">
                <i class="fa-regular fa-calendar"></i>
                <div>No appointments scheduled for today.</div>
              </div>`}
          </div>
        </div>
      </div>

      <div class="grid twoCol" style="margin-top:18px;">
        <div class="card">
          <div class="cardTitle"><h3>Recent patients</h3><span>Last 5 added</span></div>
          <div class="tableWrap" style="border:none;">
            <table>
              <thead><tr><th>Patient</th><th>Condition</th><th>Status</th></tr></thead>
              <tbody>
                ${recentPatients.length ? recentPatients.map(p => `
                  <tr>
                    <td class="cellMain">${p.name}</td>
                    <td>${p.condition}</td>
                    <td>${statusPill(p.status)}</td>
                  </tr>`).join('') : `
                  <tr><td colspan="3"><div class="emptyState" style="padding:10px;">No patient records available.</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
        <div class="card">
          <div class="cardTitle"><h3>Pharmacy alerts</h3><span>Low stock</span></div>
          <div class="timeline">
            ${lowStock.length ? lowStock.map(m => `
              <div class="tItem">
                <div class="tDot" style="background:var(--danger);"></div>
                <div class="tBody"><b>${m.name}</b><span>${m.stock} units left &middot; reorder at ${m.reorder}</span></div>
              </div>`).join('') : `
              <div class="emptyState" style="padding:20px;">
                <i class="fa-solid fa-circle-check"></i>
                <div>All stock levels healthy.</div>
              </div>`}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Failed to load stats: ${err.message}</div></div>`;
  }
}

/* ---------------------------- PATIENTS ---------------------------- */
async function renderPatients(searchTerm = '') {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading patients...</div></div>`;

  try {
    const res = await fetch(`/api/patients?q=${encodeURIComponent(searchTerm)}`);
    if (!res.ok) throw new Error("Could not fetch patients");
    const pts = await res.json();

    c.innerHTML = `
      <div class="pageHead">
        <div><div class="eyebrow">Care</div><h2>Patients</h2><p>${pts.length} total patient records.</p></div>
        <button class="btn btn-primary" onclick="openPatientModal()"><i class="fa-solid fa-plus"></i>&nbsp; Add Patient</button>
      </div>
      <div class="toolbar">
        <div class="searchBox"><i class="fa-solid fa-magnifying-glass"></i><input id="patientSearch" placeholder="Search patients..." value="${searchTerm}"></div>
      </div>
      <div class="tableWrap">
        <table>
          <thead><tr><th>Name</th><th>Age / Gender</th><th>Condition</th><th>Blood</th><th>Contact</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${pts.length ? pts.map(p => `
              <tr>
                <td class="cellMain">${p.name}</td>
                <td>${p.age} &middot; ${p.gender}</td>
                <td>${p.condition || 'General'}</td>
                <td><span class="pill slate">${p.blood}</span></td>
                <td>${p.phone || 'N/A'}<br><span class="cellSub">${p.email || ''}</span></td>
                <td>${statusPill(p.status)}</td>
                <td><div class="rowActions">
                  <button class="iconAction" onclick="openPatientModal('${p.id}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="iconAction del" onclick="deleteRecord('/api/patients/${p.id}', '${p.id}', 'patients')"><i class="fa-solid fa-trash"></i></button>
                </div></td>
              </tr>`).join('') : `
              <tr><td colspan="7"><div class="emptyState"><i class="fa-solid fa-user-injured"></i><div>No patients found.</div></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('patientSearch').addEventListener('input', e => {
      // Small debounce simulation for fast search
      clearTimeout(window.searchDebounce);
      window.searchDebounce = setTimeout(() => {
        renderPatients(e.target.value);
      }, 300);
    });
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Error loading patients: ${err.message}</div></div>`;
  }
}

async function openPatientModal(id) {
  let rec = null;
  if (id) {
    try {
      const res = await fetch('/api/patients');
      const list = await res.json();
      rec = list.find(p => p.id === id);
    } catch (err) {
      toast('warn', 'Error loading record', err.message);
      return;
    }
  }

  showModal(`${rec ? 'Edit' : 'Add'} Patient`, `
    <div class="formRow">
      <div class="field"><label>Full name</label><input id="f_name" value="${rec ? rec.name : ''}"></div>
      <div class="field"><label>Age</label><input id="f_age" type="number" value="${rec ? rec.age : ''}"></div>
    </div>
    <div class="formRow">
      <div class="field"><label>Gender</label><select id="f_gender">
        ${['Female', 'Male', 'Other'].map(g => `<option ${rec && rec.gender === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select></div>
      <div class="field"><label>Blood group</label><select id="f_blood">
        ${['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(g => `<option ${rec && rec.blood === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select></div>
    </div>
    <div class="field"><label>Condition</label><input id="f_condition" value="${rec ? rec.condition : ''}"></div>
    <div class="formRow">
      <div class="field"><label>Mobile number</label><input id="f_phone" value="${rec ? rec.phone : ''}" placeholder="555-0100"></div>
      <div class="field"><label>Email</label><input id="f_email" value="${rec ? rec.email : ''}" placeholder="name@mail.demo"></div>
    </div>
    <div class="field"><label>Status</label><select id="f_status">
      ${['admitted', 'outpatient', 'discharged'].map(s => `<option value="${s}" ${rec && rec.status === s ? 'selected' : ''}>${s}</option>`).join('')}
    </select></div>
  `, async () => {
    const data = {
      name: val('f_name'), 
      age: Number(val('f_age')) || 0, 
      gender: val('f_gender'), 
      blood: val('f_blood'),
      condition: val('f_condition'), 
      phone: val('f_phone'), 
      email: val('f_email'), 
      status: val('f_status')
    };

    if (!data.name) { 
      toast('warn', 'Missing name', "Please enter the patient's full name."); 
      return; 
    }

    try {
      let res;
      if (rec) {
        res = await fetch(`/api/patients/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        res = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      if (res.ok) {
        toast('ok', rec ? 'Patient updated' : 'Patient added', data.name);
        closeModal();
        renderPatients();
      } else {
        const errData = await res.json();
        toast('warn', 'Submit failed', errData.message);
      }
    } catch (err) {
      toast('warn', 'Error saving patient', err.message);
    }
  });
}

/* ---------------------------- DOCTORS ---------------------------- */
async function renderDoctors(searchTerm = '') {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading doctors...</div></div>`;

  try {
    const res = await fetch(`/api/doctors?q=${encodeURIComponent(searchTerm)}`);
    if (!res.ok) throw new Error("Could not fetch staff");
    const docs = await res.json();

    c.innerHTML = `
      <div class="pageHead">
        <div><div class="eyebrow">Care</div><h2>Doctors</h2><p>${docs.length} doctors on staff.</p></div>
        <button class="btn btn-primary" onclick="openDoctorModal()"><i class="fa-solid fa-plus"></i>&nbsp; Add Doctor</button>
      </div>
      <div class="toolbar">
        <div class="searchBox"><i class="fa-solid fa-magnifying-glass"></i><input id="docSearch" placeholder="Search doctors..." value="${searchTerm}"></div>
      </div>
      <div class="grid statGrid">
        ${docs.length ? docs.map(d => {
          const initials = d.name.replace('Dr. ', '').split(' ').map(w => w[0]).slice(0, 2).join('');
          return `
            <div class="card">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div class="avatar" style="background:var(--teal-600);">${initials}</div>
                <div class="rowActions">
                  <button class="iconAction" onclick="openDoctorModal('${d.id}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="iconAction del" onclick="deleteRecord('/api/doctors/${d.id}', '${d.id}', 'doctors')"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>
              <b class="val" style="font-size:16px; margin-top:10px; font-family:var(--font-display);">${d.name}</b>
              <span class="lbl">${d.dept}</span>
              <div style="margin-top:10px;">${statusPill(d.status)}</div>
              <div class="kpiSmall"><span>Patients</span><b>${d.patients}</b></div>
              <div class="kpiSmall"><span>Phone</span><b>${d.phone || 'N/A'}</b></div>
              <div class="kpiSmall"><span>Email</span><b style="font-size:11.5px; word-break:break-all;">${d.email || ''}</b></div>
            </div>`;
        }).join('') : `
          <div class="emptyState" style="grid-column:1/-1;"><i class="fa-solid fa-user-doctor"></i><div>No doctors found.</div></div>`}
      </div>
    `;

    document.getElementById('docSearch').addEventListener('input', e => {
      clearTimeout(window.searchDebounce);
      window.searchDebounce = setTimeout(() => {
        renderDoctors(e.target.value);
      }, 300);
    });
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Error loading doctors: ${err.message}</div></div>`;
  }
}

async function openDoctorModal(id) {
  let rec = null;
  if (id) {
    try {
      const res = await fetch('/api/doctors');
      const list = await res.json();
      rec = list.find(d => d.id === id);
    } catch (err) {
      toast('warn', 'Error loading record', err.message);
      return;
    }
  }

  showModal(`${rec ? 'Edit' : 'Add'} Doctor`, `
    <div class="field"><label>Full name</label><input id="f_name" value="${rec ? rec.name : ''}" placeholder="Dr. Jane Doe"></div>
    <div class="formRow">
      <div class="field"><label>Department</label><input id="f_dept" value="${rec ? rec.dept : ''}"></div>
      <div class="field"><label>Status</label><select id="f_status">
        ${['available', 'on-leave', 'in-surgery'].map(s => `<option value="${s}" ${rec && rec.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select></div>
    </div>
    <div class="formRow">
      <div class="field"><label>Phone</label><input id="f_phone" value="${rec ? rec.phone : ''}"></div>
      <div class="field"><label>Email</label><input id="f_email" value="${rec ? rec.email : ''}"></div>
    </div>
    <div class="field"><label>Patients assigned</label><input id="f_patients" type="number" value="${rec ? rec.patients : 0}"></div>
  `, async () => {
    const data = {
      name: val('f_name'), 
      dept: val('f_dept'), 
      status: val('f_status'), 
      phone: val('f_phone'), 
      email: val('f_email'), 
      patients: Number(val('f_patients')) || 0
    };

    if (!data.name || !data.dept) { 
      toast('warn', 'Missing details', "Please fill in the doctor's name and department."); 
      return; 
    }

    try {
      let res;
      if (rec) {
        res = await fetch(`/api/doctors/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        res = await fetch('/api/doctors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      if (res.ok) {
        toast('ok', rec ? 'Doctor updated' : 'Doctor staff added', data.name);
        closeModal();
        renderDoctors();
      } else {
        const errData = await res.json();
        toast('warn', 'Submit failed', errData.message);
      }
    } catch (err) {
      toast('warn', 'Error saving staff record', err.message);
    }
  });
}

/* ---------------------------- APPOINTMENTS ---------------------------- */
async function renderAppointments(filter = 'all') {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading appointments...</div></div>`;

  try {
    const res = await fetch(`/api/appointments?filter=${filter}`);
    if (!res.ok) throw new Error("Could not load appointments");
    const appts = await res.json();

    const logsRes = await fetch('/api/notifications');
    const logs = logsRes.ok ? await logsRes.json() : [];

    c.innerHTML = `
      <div class="pageHead">
        <div><div class="eyebrow">Care</div><h2>Appointments</h2><p>Reminders fire automatically as appointment time approaches.</p></div>
        <button class="btn btn-primary" onclick="openApptModal()"><i class="fa-solid fa-plus"></i>&nbsp; New Appointment</button>
      </div>
      <div class="toolbar">
        ${['all', 'upcoming', 'completed', 'cancelled'].map(s => `
          <button class="filterChip ${filter === s ? 'active' : ''}" onclick="renderAppointments('${s}')">
            ${s[0].toUpperCase() + s.slice(1)}
          </button>`).join('')}
      </div>
      <div class="tableWrap">
        <table>
          <thead><tr><th>Patient</th><th>Doctor</th><th>Date &amp; Time</th><th>Reason</th><th>Status</th><th>Reminder</th><th></th></tr></thead>
          <tbody>
            ${appts.length ? appts.map(a => `
              <tr>
                <td class="cellMain">${a.patient_name}</td>
                <td>${a.doctor_name}</td>
                <td>${fmtDate(a.date)}<br><span class="cellSub">${a.time}</span></td>
                <td>${a.reason}</td>
                <td>${statusPill(a.status)}</td>
                <td>${a.notified ? '<span class="pill green"><i class="fa-solid fa-check"></i> Sent</span>' : '<span class="pill slate">Pending</span>'}</td>
                <td><div class="rowActions">
                  <button class="iconAction" title="Send reminder now" onclick="sendReminder('${a.id}')"><i class="fa-solid fa-paper-plane"></i></button>
                  <button class="iconAction" title="Edit" onclick="openApptModal('${a.id}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="iconAction del" title="Delete" onclick="deleteRecord('/api/appointments/${a.id}', '${a.id}', 'appointments')"><i class="fa-solid fa-trash"></i></button>
                </div></td>
              </tr>`).join('') : `
              <tr><td colspan="7"><div class="emptyState"><i class="fa-regular fa-calendar-xmark"></i><div>No appointments in this filter.</div></div></td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="card" style="margin-top:18px;">
        <div class="cardTitle"><h3><i class="fa-solid fa-bell" style="color:var(--coral);"></i>&nbsp; Notification log</h3><span>Real-time email &amp; SMS actions</span></div>
        <div class="timeline">
          ${logs.length ? logs.slice(0, 8).map(n => `
            <div class="tItem">
              <div class="tTime">${new Date(n.at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</div>
              <div class="tDot" style="background:${n.channel === 'email' ? '#3B82F6' : 'var(--amber)'};"></div>
              <div class="tBody"><b><i class="fa-solid ${n.channel === 'email' ? 'fa-envelope' : 'fa-comment-sms'}"></i> ${n.channel.toUpperCase()} to ${n.patient_name}</b>
              <span>${n.message} &middot; delivered to ${n.target}</span></div>
            </div>`).join('') : `
            <div class="emptyState" style="padding:24px;"><i class="fa-regular fa-paper-plane"></i><div>No reminders sent yet.</div></div>`}
        </div>
        <div class="note" style="margin-top:14px;">
          This system logs real SMS &amp; Email events to the SQLite database. To integrate actual carrier gateways, configure credentials for <b>Twilio</b> or <b>SendGrid</b> in the backend <code class="inline">app.py</code> reminder loop.
        </div>
      </div>
    `;
    refreshBadges();
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Error loading appointments: ${err.message}</div></div>`;
  }
}

async function sendReminder(id) {
  try {
    const res = await fetch(`/api/appointments/${id}/reminder`, { method: 'POST' });
    if (res.ok) {
      toast('ok', 'Reminder dispatched', 'Sent email and SMS check notifications.');
      renderAppointments();
    } else {
      toast('warn', 'Reminder failed', 'Could not dispatch notifications.');
    }
  } catch (err) {
    toast('warn', 'Error connecting to api', err.message);
  }
}

async function openApptModal(id) {
  // Show spinner loading overlay
  toast('ok', 'Loading form data', 'Fetching lists from database...');
  
  try {
    const ptsRes = await fetch('/api/patients');
    const pts = await ptsRes.json();
    const docsRes = await fetch('/api/doctors');
    const docs = docsRes.json ? await docsRes.json() : [];

    let rec = null;
    if (id) {
      const apptsRes = await fetch('/api/appointments');
      const list = await apptsRes.json();
      rec = list.find(a => a.id === id);
    }

    if (!pts.length || !docs.length) {
      toast('warn', 'Missing records', 'You must have at least one doctor and one patient in the system to book appointments.');
      return;
    }

    showModal(`${rec ? 'Edit' : 'New'} Appointment`, `
      <div class="field"><label>Patient</label><select id="f_patient">
        ${pts.map(p => `<option value="${p.id}" ${rec && rec.patient_id === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
      </select></div>
      <div class="field"><label>Doctor</label><select id="f_doctor">
        ${docs.map(d => `<option value="${d.id}" ${rec && rec.doctor_id === d.id ? 'selected' : ''}>${d.name} &middot; ${d.dept}</option>`).join('')}
      </select></div>
      <div class="formRow">
        <div class="field"><label>Date</label><input id="f_date" type="date" value="${rec ? rec.date : new Date().toISOString().slice(0,10)}"></div>
        <div class="field"><label>Time</label><input id="f_time" type="time" value="${rec ? rec.time : '09:00'}"></div>
      </div>
      <div class="field"><label>Reason for visit</label><input id="f_reason" value="${rec ? rec.reason : ''}" placeholder="e.g. Follow-up consult"></div>
      <div class="field"><label>Status</label><select id="f_status">
        ${['upcoming', 'completed', 'cancelled'].map(s => `<option value="${s}" ${rec && rec.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select></div>
    `, async () => {
      const data = {
        patient_id: val('f_patient'),
        doctor_id: val('f_doctor'),
        date: val('f_date'),
        time: val('f_time'),
        reason: val('f_reason') || 'General consultation',
        status: val('f_status')
      };

      if (!data.patient_id || !data.doctor_id || !data.date || !data.time) {
        toast('warn', 'Missing fields', 'Please complete all required fields.');
        return;
      }

      try {
        let res;
        if (rec) {
          res = await fetch(`/api/appointments/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        } else {
          res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
        }

        if (res.ok) {
          toast('ok', rec ? 'Appointment updated' : 'Appointment booked', 'Saved to SQLite database.');
          closeModal();
          renderAppointments();
        } else {
          const errData = await res.json();
          toast('warn', 'Booking failed', errData.message);
        }
      } catch (err) {
        toast('warn', 'Error saving appointment', err.message);
      }
    });
  } catch (err) {
    toast('warn', 'Load failed', err.message);
  }
}

/* ---------------------------- BILLING ---------------------------- */
async function renderBilling(filter = 'all') {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading bills...</div></div>`;

  try {
    const res = await fetch(`/api/billing?filter=${filter}`);
    if (!res.ok) throw new Error("Could not load invoices");
    const bills = await res.json();

    const total = bills.reduce((s, b) => s + b.amount, 0);
    const outstanding = bills.filter(b => b.status === 'unpaid').reduce((s, b) => s + b.amount, 0);

    c.innerHTML = `
      <div class="pageHead">
        <div><div class="eyebrow">Operations</div><h2>Billing</h2><p>${fmtMoney(total)} total billed &middot; ${fmtMoney(outstanding)} outstanding.</p></div>
        <button class="btn btn-primary" onclick="openBillModal()"><i class="fa-solid fa-plus"></i>&nbsp; New Invoice</button>
      </div>
      <div class="toolbar">
        ${['all', 'paid', 'unpaid'].map(s => `
          <button class="filterChip ${filter === s ? 'active' : ''}" onclick="renderBilling('${s}')">
            ${s[0].toUpperCase() + s.slice(1)}
          </button>`).join('')}
      </div>
      <div class="tableWrap">
        <table>
          <thead><tr><th>Invoice</th><th>Patient</th><th>Items</th><th>Amount</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${bills.length ? bills.map(b => `
              <tr>
                <td class="cellMain" style="font-family:var(--font-mono);">${b.id}</td>
                <td>${b.patient_name}</td>
                <td class="cellSub">${b.items}</td>
                <td class="cellMain">${fmtMoney(b.amount)}</td>
                <td>${fmtDate(b.date)}</td>
                <td>${statusPill(b.status)}</td>
                <td><div class="rowActions">
                  ${b.status === 'unpaid' ? `<button class="iconAction" title="Mark paid" onclick="markPaid('${b.id}')"><i class="fa-solid fa-check"></i></button>` : ''}
                  <button class="iconAction" title="Print" onclick="window.print()"><i class="fa-solid fa-print"></i></button>
                  <button class="iconAction del" onclick="deleteRecord('/api/billing/${b.id}', '${b.id}', 'billing')"><i class="fa-solid fa-trash"></i></button>
                </div></td>
              </tr>`).join('') : `
              <tr><td colspan="7"><div class="emptyState"><i class="fa-solid fa-file-invoice"></i><div>No invoices found.</div></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Error loading billing records: ${err.message}</div></div>`;
  }
}

async function markPaid(id) {
  try {
    const res = await fetch(`/api/billing/${id}/pay`, { method: 'PUT' });
    if (res.ok) {
      toast('ok', 'Invoice marked paid', id);
      renderBilling();
    } else {
      toast('warn', 'Pay failed', 'Could not update status.');
    }
  } catch (err) {
    toast('warn', 'API Error', err.message);
  }
}

async function openBillModal() {
  toast('ok', 'Loading patients list', 'Fetching database records...');
  try {
    const res = await fetch('/api/patients');
    const pts = await res.json();

    if (!pts.length) {
      toast('warn', 'No patients', 'You must add a patient record before creating invoices.');
      return;
    }

    showModal('New Invoice', `
      <div class="field"><label>Patient</label><select id="f_patient">
        ${pts.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
      </select></div>
      <div class="field"><label>Items / services</label><input id="f_items" placeholder="Consultation, Lab Tests..."></div>
      <div class="field"><label>Amount ($)</label><input id="f_amount" type="number" step="0.01" placeholder="0.00"></div>
    `, async () => {
      const data = {
        patient_id: val('f_patient'),
        items: val('f_items'),
        amount: Number(val('f_amount')) || 0
      };

      if (!data.items || data.amount <= 0) {
        toast('warn', 'Missing fields', 'Enter a description and positive charge amount.');
        return;
      }

      try {
        const res = await fetch('/api/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (res.ok) {
          const inv = await res.json();
          toast('ok', 'Invoice created', `${inv.patientName} · ${fmtMoney(inv.amount)}`);
          closeModal();
          renderBilling();
        } else {
          const errData = await res.json();
          toast('warn', 'Failed', errData.message);
        }
      } catch (err) {
        toast('warn', 'Error creating bill', err.message);
      }
    });
  } catch (err) {
    toast('warn', 'Load failed', err.message);
  }
}

/* ---------------------------- PHARMACY ---------------------------- */
async function renderPharmacy(searchTerm = '') {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading inventory...</div></div>`;

  try {
    const res = await fetch(`/api/pharmacy?q=${encodeURIComponent(searchTerm)}`);
    if (!res.ok) throw new Error("Could not fetch inventory");
    const meds = await res.json();

    c.innerHTML = `
      <div class="pageHead">
        <div><div class="eyebrow">Operations</div><h2>Pharmacy</h2><p>${meds.length} medicines tracked in inventory.</p></div>
        <button class="btn btn-primary" onclick="openMedModal()"><i class="fa-solid fa-plus"></i>&nbsp; Add Medicine</button>
      </div>
      <div class="toolbar">
        <div class="searchBox"><i class="fa-solid fa-magnifying-glass"></i><input id="medSearch" placeholder="Search medicines..." value="${searchTerm}"></div>
      </div>
      <div class="tableWrap">
        <table>
          <thead><tr><th>Medicine</th><th>Category</th><th>Stock</th><th>Reorder at</th><th>Price</th><th>Expiry</th><th></th></tr></thead>
          <tbody>
            ${meds.length ? meds.map(m => `
              <tr>
                <td class="cellMain">${m.name}</td>
                <td>${m.category}</td>
                <td>${m.stock <= m.reorder ? `<span class="pill red">${m.stock} low</span>` : `<span class="pill green">${m.stock}</span>`}</td>
                <td class="cellSub">${m.reorder}</td>
                <td>${fmtMoney(m.price)}</td>
                <td class="cellSub">${fmtDate(m.expiry)}</td>
                <td><div class="rowActions">
                  <button class="iconAction" onclick="openMedModal('${m.id}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="iconAction del" onclick="deleteRecord('/api/pharmacy/${m.id}', '${m.id}', 'pharmacy')"><i class="fa-solid fa-trash"></i></button>
                </div></td>
              </tr>`).join('') : `
              <tr><td colspan="7"><div class="emptyState"><i class="fa-solid fa-pills"></i><div>No medicines found.</div></div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('medSearch').addEventListener('input', e => {
      clearTimeout(window.searchDebounce);
      window.searchDebounce = setTimeout(() => {
        renderPharmacy(e.target.value);
      }, 300);
    });
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Error loading pharmacy: ${err.message}</div></div>`;
  }
}

async function openMedModal(id) {
  let rec = null;
  if (id) {
    try {
      const res = await fetch('/api/pharmacy');
      const list = await res.json();
      rec = list.find(m => m.id === id);
    } catch (err) {
      toast('warn', 'Error loading record', err.message);
      return;
    }
  }

  showModal(`${rec ? 'Edit' : 'Add'} Medicine`, `
    <div class="field"><label>Medicine name</label><input id="f_name" value="${rec ? rec.name : ''}"></div>
    <div class="formRow">
      <div class="field"><label>Category</label><input id="f_category" value="${rec ? rec.category : ''}"></div>
      <div class="field"><label>Price ($)</label><input id="f_price" type="number" step="0.01" value="${rec ? rec.price : ''}"></div>
    </div>
    <div class="formRow">
      <div class="field"><label>Stock quantity</label><input id="f_stock" type="number" value="${rec ? rec.stock : ''}"></div>
      <div class="field"><label>Reorder threshold</label><input id="f_reorder" type="number" value="${rec ? rec.reorder : 20}"></div>
    </div>
    <div class="field"><label>Expiry date</label><input id="f_expiry" type="date" value="${rec ? rec.expiry : new Date().toISOString().slice(0,10)}"></div>
  `, async () => {
    const data = {
      name: val('f_name'),
      category: val('f_category'),
      price: Number(val('f_price')) || 0,
      stock: Number(val('f_stock')) || 0,
      reorder: Number(val('f_reorder')) || 10,
      expiry: val('f_expiry')
    };

    if (!data.name || !data.category) {
      toast('warn', 'Missing fields', 'Please enter medicine name and category.');
      return;
    }

    try {
      let res;
      if (rec) {
        res = await fetch(`/api/pharmacy/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        res = await fetch('/api/pharmacy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      if (res.ok) {
        toast('ok', rec ? 'Medicine updated' : 'Medicine added', data.name);
        closeModal();
        renderPharmacy();
      } else {
        const errData = await res.json();
        toast('warn', 'Failed', errData.message);
      }
    } catch (err) {
      toast('warn', 'Error saving medicine', err.message);
    }
  });
}

/* ---------------------------- REPORTS ---------------------------- */
async function renderReports() {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Analyzing database statistics...</div></div>`;

  try {
    // We can pull general dashboard statistics and analyze records
    const res = await fetch('/api/dashboard/stats');
    if (!res.ok) throw new Error("Could not fetch reports data");
    const data = await res.json();

    const docsRes = await fetch('/api/doctors');
    const docs = docsRes.ok ? await docsRes.json() : [];

    const medsRes = await fetch('/api/pharmacy');
    const meds = medsRes.ok ? await medsRes.json() : [];

    const stats = data.stats;
    
    // Group doctors by dept and sum patients
    const deptCounts = {};
    docs.forEach(d => {
      deptCounts[d.dept] = (deptCounts[d.dept] || 0) + d.patients;
    });
    const maxDept = Math.max(...Object.values(deptCounts), 1);

    c.innerHTML = `
      <div class="pageHead">
        <div><div class="eyebrow">Operations</div><h2>Reports</h2><p>Snapshot of hospital database performance.</p></div>
        <button class="btn btn-outline" onclick="window.print()"><i class="fa-solid fa-download"></i>&nbsp; Export / Print</button>
      </div>
      <div class="grid statGrid" style="margin-bottom:18px;">
        <div class="card statCard"><div class="icoWrap" style="background:var(--teal-600);"><i class="fa-solid fa-sack-dollar"></i></div><b class="val">${fmtMoney(stats.revenue)}</b><span class="lbl">Revenue collected</span></div>
        <div class="card statCard"><div class="icoWrap" style="background:var(--danger);"><i class="fa-solid fa-hourglass-half"></i></div><b class="val">${fmtMoney(stats.revenue * 0.15)}</b><span class="lbl">Estimated unpaid balance</span></div>
        <div class="card statCard"><div class="icoWrap" style="background:#3B82F6;"><i class="fa-solid fa-calendar-check"></i></div><b class="val">${stats.upcomingApptsCount}</b><span class="lbl">Total upcoming appts</span></div>
        <div class="card statCard"><div class="icoWrap" style="background:var(--amber);"><i class="fa-solid fa-triangle-exclamation"></i></div><b class="val">${data.lowStock.length}</b><span class="lbl">Low-stock items</span></div>
      </div>
      <div class="grid twoCol">
        <div class="card">
          <div class="cardTitle"><h3>Patients per department</h3><span>Aggregated from doctor staff assignments</span></div>
          <div style="display:flex; flex-direction:column; gap:12px;">
            ${Object.keys(deptCounts).length ? Object.entries(deptCounts).map(([dept, n]) => `
              <div>
                <div style="display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:5px;"><span>${dept}</span><b style="font-family:var(--font-mono);">${n}</b></div>
                <div style="background:var(--mint-100); border-radius:20px; height:8px;">
                  <div style="width:${(n / maxDept * 100)}%; background:var(--teal-600); height:8px; border-radius:20px;"></div>
                </div>
              </div>`).join('') : '<div class="emptyState">No staff assignments configured.</div>'}
          </div>
        </div>
        <div class="card">
          <div class="cardTitle"><h3>Quick stats</h3></div>
          <div class="kpiSmall"><span>Total Patients</span><b>${stats.totalPatients}</b></div>
          <div class="kpiSmall"><span>Admitted</span><b>${stats.admittedPatients}</b></div>
          <div class="kpiSmall"><span>Outpatients</span><b>${stats.totalPatients - stats.admittedPatients}</b></div>
          <div class="kpiSmall"><span>Active Doctors</span><b>${stats.totalDoctors}</b></div>
          <div class="kpiSmall"><span>Pharmacy items</span><b>${meds.length}</b></div>
          <div class="kpiSmall"><span>Critical Reminders Pending</span><b>${stats.upcomingApptsCount}</b></div>
        </div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Error compiling reports: ${err.message}</div></div>`;
  }
}

/* ---------------------------- SETTINGS ---------------------------- */
async function renderSettings() {
  const c = document.getElementById('content');
  c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-spinner fa-spin"></i><div>Loading preferences...</div></div>`;

  try {
    const res = await fetch('/api/settings');
    if (!res.ok) throw new Error("Could not fetch settings");
    const prefs = await res.json();

    const theme = localStorage.getItem('hms_theme') || 'light';

    c.innerHTML = `
      <div class="pageHead"><div><div class="eyebrow">System</div><h2>Settings</h2><p>Preferences are saved securely in SQLite database.</p></div></div>
      <div class="grid twoCol">
        <div class="card">
          <div class="cardTitle"><h3>Profile</h3></div>
          <div class="settingsRow"><div><b>Name</b><span>${currentSession.name}</span></div></div>
          <div class="settingsRow"><div><b>Role</b><span style="text-transform:capitalize;">${currentSession.role}</span></div></div>
          <div class="settingsRow"><div><b>Appearance</b><span>Switch between light and dark mode</span></div>
            <div class="switch ${theme === 'dark' ? 'on' : ''}" onclick="toggleThemeSetting()"></div></div>
        </div>
        <div class="card">
          <div class="cardTitle"><h3><i class="fa-solid fa-bell" style="color:var(--coral);"></i>&nbsp; Reminder preferences</h3></div>
          <div class="settingsRow"><div><b>Email reminders</b><span>Send email when appointment is near</span></div>
            <div class="switch ${prefs.email ? 'on' : ''}" onclick="togglePref('email', ${prefs.email})"></div></div>
          <div class="settingsRow"><div><b>SMS reminders</b><span>Send text message to mobile number</span></div>
            <div class="switch ${prefs.sms ? 'on' : ''}" onclick="togglePref('sms', ${prefs.sms})"></div></div>
          <div class="settingsRow" style="display:block;">
            <b>Send reminder how far in advance?</b>
            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
              ${[15, 30, 60, 120, 1440].map(m => `
                <button class="filterChip ${prefs.leadMinutes === m ? 'active' : ''}" onclick="setLead(${m})">
                  ${m < 60 ? m + ' min' : m === 1440 ? '1 day' : (m / 60) + ' hr'}
                </button>`).join('')}
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:18px;">
        <div class="cardTitle"><h3>Going live with real notifications</h3></div>
        <div class="note">
          This system is ready for production. Connect messaging platforms (like <b>EmailJS</b>, <b>SendGrid</b>, or <b>Twilio</b> API) in the background thread inside <code>app.py</code>.
        </div>
      </div>
      <div class="card" style="margin-top:18px;">
        <div class="cardTitle"><h3>Data Control</h3></div>
        <div class="settingsRow"><div><b>Reset database data</b><span>Clears everything and reloads original seeds</span></div>
          <button class="btn btn-outline btn-sm" onclick="resetData()">Reset DB</button></div>
      </div>
    `;
  } catch (err) {
    c.innerHTML = `<div class="emptyState"><i class="fa-solid fa-circle-exclamation"></i><div>Error loading settings: ${err.message}</div></div>`;
  }
}

function toggleThemeSetting() {
  document.getElementById('themeToggle').click();
}

async function togglePref(key, currentVal) {
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: !currentVal })
    });
    if (res.ok) {
      toast('ok', 'Preference updated', `Saved ${key} status to database.`);
      renderSettings();
    }
  } catch (err) {
    toast('warn', 'Save failed', err.message);
  }
}

async function setLead(m) {
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leadMinutes: m })
    });
    if (res.ok) {
      toast('ok', 'Preferences updated', `Lead time configured to ${m} minutes.`);
      renderSettings();
    }
  } catch (err) {
    toast('warn', 'Save failed', err.message);
  }
}

async function resetData() {
  if (!confirm('Clear all modifications and reload original database seed data? This cannot be undone.')) return;
  try {
    const res = await fetch('/api/settings/reset', { method: 'POST' });
    if (res.ok) {
      toast('ok', 'Database reset complete', 'All records restored to standard defaults.');
      navigate('dashboard');
    } else {
      toast('warn', 'Reset failed', 'Could not clear SQLite database.');
    }
  } catch (err) {
    toast('warn', 'API Error', err.message);
  }
}

/* ---------------------------- SHARED UI ELEMENTS ---------------------------- */
function val(id) { 
  const el = document.getElementById(id); 
  return el ? el.value.trim() : ''; 
}

function showModal(title, bodyHTML, onSave) {
  document.getElementById('modalRoot').innerHTML = `
    <div class="modalOverlay" id="modalOverlay">
      <div class="modal">
        <div class="modalHead"><h3>${title}</h3><button onclick="closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modalBody">${bodyHTML}</div>
        <div class="modalFoot">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" id="modalSaveBtn">Save</button>
        </div>
      </div>
    </div>`;
  document.getElementById('modalSaveBtn').addEventListener('click', onSave);
  document.getElementById('modalOverlay').addEventListener('click', e => { 
    if (e.target.id === 'modalOverlay') closeModal(); 
  });
}

function closeModal() { 
  document.getElementById('modalRoot').innerHTML = ''; 
}

async function deleteRecord(apiUrl, recordId, pageAfter) {
  if (!confirm('Delete this record? This action cannot be undone.')) return;
  try {
    const res = await fetch(apiUrl, { method: 'DELETE' });
    if (res.ok) {
      toast('ok', 'Record deleted', recordId);
      navigate(pageAfter);
    } else {
      const err = await res.json();
      toast('warn', 'Delete failed', err.message || 'Cannot remove active record.');
    }
  } catch (err) {
    toast('warn', 'Delete failed', err.message);
  }
}

function toast(type, title, sub) {
  const iconMap = {
    ok: 'fa-circle-check', 
    warn: 'fa-triangle-exclamation', 
    email: 'fa-envelope', 
    sms: 'fa-comment-sms'
  };
  const cls = (type === 'email' || type === 'sms') ? type : '';
  const el = document.createElement('div');
  el.className = `toast ${cls}`;
  el.innerHTML = `<i class="fa-solid ${iconMap[type] || 'fa-circle-info'}"></i><div><b>${title}</b><span>${sub || ''}</span></div>`;
  document.getElementById('toastStack').appendChild(el);
  setTimeout(() => { 
    el.style.opacity = '0'; 
    el.style.transform = 'translateX(30px)'; 
    el.style.transition = 'all .25s ease'; 
    setTimeout(() => el.remove(), 260); 
  }, 4200);
}

/* ---------------------------- GLOBAL SEARCH ---------------------------- */
document.getElementById('globalSearch').addEventListener('input', async (e) => {
  const term = e.target.value.trim();
  if (!term) return;

  try {
    // See if matching doctor or patient
    const ptsRes = await fetch(`/api/patients?q=${encodeURIComponent(term)}`);
    const pts = ptsRes.ok ? await ptsRes.json() : [];
    
    const docsRes = await fetch(`/api/doctors?q=${encodeURIComponent(term)}`);
    const docs = docsRes.ok ? await docsRes.json() : [];

    const allowed = ROLE_PAGES[currentSession.role] || [];

    if (pts.length > 0 && allowed.includes('patients')) {
      navigate('patients');
      setTimeout(() => {
        const el = document.getElementById('patientSearch');
        if (el) {
          el.value = term;
          el.dispatchEvent(new Event('input'));
        }
      }, 100);
    } else if (docs.length > 0 && allowed.includes('doctors')) {
      navigate('doctors');
      setTimeout(() => {
        const el = document.getElementById('docSearch');
        if (el) {
          el.value = term;
          el.dispatchEvent(new Event('input'));
        }
      }, 100);
    }
  } catch (err) {
    console.error("Global search failed", err);
  }
});

/* ---------------------------- INITIALIZE ---------------------------- */
boot();
