// ===============================
// MAGMAX EDUCATIONAL CENTRE - app.js
// Works with the Node/Express + PostgreSQL API (server.js)
// ===============================

const API_URL = "http://localhost:3000/api";

const CLASS_GROUPS = {
    deptEarlyChildhood: ["Creche", "Nursery 1", "Nursery 2", "KG 1", "KG 2"],
    deptPrimary: ["Basic 1", "Basic 2", "Basic 3", "Basic 4", "Basic 5", "Basic 6"],
    deptJHS: ["Basic 7", "Basic 8", "Basic 9"]
};

const VIEWS = {
    "dashboard": "dashboardView",
    "class-departments": "classDepartmentsView",
    "add-student": "addStudentView",
    "directory": "directoryView"
};

let students = [];
let activeRosterClass = null;

// -------------------------------
// HELPERS
// -------------------------------
const $ = (id) => document.getElementById(id);

function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function notify(message, type = "success") {
    const box = $("notificationAlert");
    box.textContent = message;
    box.classList.remove("d-none", "alert-success", "alert-danger");
    box.classList.add(type === "danger" ? "alert-danger" : "alert-success");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => box.classList.add("d-none"), 4000);
}

function setConnection(ok, text) {
    const box = $("connectionStatus");
    box.classList.remove("d-none", "alert-secondary", "alert-danger");
    box.classList.add(ok ? "alert-secondary" : "alert-danger");
    $("connectionStatusText").textContent = text;
}

async function api(path, options = {}) {
    const token = sessionStorage.getItem("magmaxToken");
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;

    const response = await fetch(API_URL + path, { ...options, headers });

    if (response.status === 401 && path !== "/login") {
        logout();
        throw new Error("Session expired. Please log in again.");
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || "Server returned " + response.status);
    }
    return data;
}

// -------------------------------
// START
// -------------------------------
document.addEventListener("DOMContentLoaded", () => {
    if (sessionStorage.getItem("magmaxToken")) {
        showApp();
    } else {
        showLogin();
    }

    $("loginForm").addEventListener("submit", handleLogin);
    $("studentForm").addEventListener("submit", handleSaveStudent);
});

// -------------------------------
// LOGIN / LOGOUT
// -------------------------------
async function handleLogin(e) {
    e.preventDefault();
    const errorBox = $("loginError");
    errorBox.classList.add("d-none");

    try {
        const result = await api("/login", {
            method: "POST",
            body: JSON.stringify({
                username: $("username").value.trim(),
                password: $("password").value
            })
        });

        sessionStorage.setItem("magmaxToken", result.token);
        $("loginForm").reset();
        showApp();
    } catch (error) {
        errorBox.textContent = error.message === "Failed to fetch"
            ? "Unable to connect to the server."
            : error.message;
        errorBox.classList.remove("d-none");
    }
}

function showLogin() {
    $("loginSection").classList.remove("d-none");
    $("appSection").classList.add("d-none");
}

function showApp() {
    $("loginSection").classList.add("d-none");
    $("appSection").classList.remove("d-none");
    showSection("dashboard");
    loadStudents();
}

function logout() {
    sessionStorage.removeItem("magmaxToken");
    students = [];
    showLogin();
}

// -------------------------------
// NAVIGATION
// -------------------------------
function showSection(name, keepForm = false) {
    Object.values(VIEWS).forEach((id) => { $(id).style.display = "none"; });
    $(VIEWS[name]).style.display = "block";

    if (name === "add-student" && !keepForm) resetForm();
    if (name === "directory") renderDirectory();
    if (name === "class-departments") renderDepartments();

    window.scrollTo(0, 0);
}

// -------------------------------
// LOAD DATA
// -------------------------------
async function loadStudents() {
    try {
        students = await api("/students");
        setConnection(true, "Connected - " + students.length + " students loaded");
        updateStats();
        renderDirectory();
        renderDepartments();
        if (activeRosterClass) showRoster(activeRosterClass);
    } catch (error) {
        console.error(error);
        setConnection(false, "Unable to load data: " + error.message);
    }
}

async function refreshData() {
    await loadStudents();
    notify("Data refreshed.");
}

function updateStats() {
    $("statStudents").textContent = students.length;

    let contacts = 0;
    students.forEach((s) => {
        [s.fatherPhone, s.motherPhone, s.guardianPhone].forEach((p) => { if (p) contacts++; });
    });
    $("statParents").textContent = contacts;

    const classCount = Object.values(CLASS_GROUPS).reduce((n, list) => n + list.length, 0);
    $("statClasses").textContent = classCount;
}

// -------------------------------
// TABLE PIECES
// -------------------------------
function contactsHtml(s) {
    const parts = [];
    if (s.fatherName || s.fatherPhone) {
        parts.push(`<div><small class="text-muted">Father:</small> ${esc(s.fatherName)} ${esc(s.fatherPhone)}</div>`);
    }
    if (s.motherName || s.motherPhone) {
        parts.push(`<div><small class="text-muted">Mother:</small> ${esc(s.motherName)} ${esc(s.motherPhone)}</div>`);
    }
    if (s.guardianName || s.guardianPhone) {
        parts.push(`<div><small class="text-muted">Guardian:</small> ${esc(s.guardianName)} ${esc(s.guardianPhone)}</div>`);
    }
    return parts.join("") || '<span class="text-muted">-</span>';
}

function actionsHtml(s) {
    return `
        <td class="text-center text-nowrap">
            <button class="btn btn-sm btn-outline-primary" title="Edit" onclick="editStudent(${Number(s.id)})"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-danger" title="Delete" onclick="deleteStudent(${Number(s.id)})"><i class="bi bi-trash"></i></button>
        </td>`;
}

// -------------------------------
// DIRECTORY (search + filter)
// -------------------------------
function renderDirectory() {
    const body = $("directoryTableBody");
    const term = $("directorySearch").value.trim().toLowerCase();
    const cls = $("directoryClassFilter").value;

    const list = students.filter((s) => {
        if (cls && s.className !== cls) return false;
        if (!term) return true;
        const haystack = [
            s.admNo, s.firstName, s.surname, s.fatherName, s.motherName, s.guardianName,
            s.fatherPhone, s.motherPhone, s.guardianPhone
        ].join(" ").toLowerCase();
        return haystack.includes(term);
    });

    if (list.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No students found.</td></tr>`;
        return;
    }

    body.innerHTML = list.map((s) => `
        <tr>
            <td>${esc(s.admNo)}</td>
            <td>${esc(s.firstName)} ${esc(s.surname)}</td>
            <td>${esc(s.className)}</td>
            <td>${esc(s.dob)}</td>
            <td>${contactsHtml(s)}</td>
            ${actionsHtml(s)}
        </tr>
    `).join("");
}

// -------------------------------
// CLASS DEPARTMENTS + ROSTER
// -------------------------------
function renderDepartments() {
    Object.entries(CLASS_GROUPS).forEach(([containerId, classes]) => {
        $(containerId).innerHTML = classes.map((c) => {
            const count = students.filter((s) => s.className === c).length;
            return `
                <button class="btn btn-outline-secondary d-flex justify-content-between align-items-center"
                        onclick="showRoster('${c}')">
                    <span>${esc(c)}</span>
                    <span class="badge bg-secondary">${count}</span>
                </button>`;
        }).join("");
    });
}

function showRoster(className) {
    activeRosterClass = className;
    const list = students.filter((s) => s.className === className);

    $("activeRosterPanel").classList.remove("d-none");
    $("activeRosterTitle").textContent = className + " - Class List";
    $("activeRosterCount").textContent = list.length + (list.length === 1 ? " Learner" : " Learners");

    const body = $("activeRosterTableBody");
    if (list.length === 0) {
        body.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No learners in this class yet.</td></tr>`;
        return;
    }

    body.innerHTML = list.map((s) => `
        <tr>
            <td>${esc(s.admNo)}</td>
            <td>${esc(s.firstName)} ${esc(s.surname)}</td>
            <td>${esc(s.dob)}</td>
            <td>${esc(s.gender)}</td>
            <td>${contactsHtml(s)}</td>
            ${actionsHtml(s)}
        </tr>
    `).join("");
}

// -------------------------------
// ADD / EDIT / DELETE
// -------------------------------
const FORM_FIELDS = [
    "admNo", "firstName", "surname", "dob", "gender", "className",
    "fatherName", "fatherPhone", "motherName", "motherPhone",
    "guardianName", "guardianPhone", "address"
];

function resetForm() {
    $("studentForm").reset();
    $("editStudentId").value = "";
    $("formTitle").textContent = "Register New Student";
}

function editStudent(id) {
    const s = students.find((x) => Number(x.id) === Number(id));
    if (!s) return;

    FORM_FIELDS.forEach((f) => { $(f).value = s[f] || ""; });
    $("editStudentId").value = s.id;
    $("formTitle").textContent = "Edit Student";
    showSection("add-student", true);
}

async function handleSaveStudent(e) {
    e.preventDefault();

    const payload = {};
    FORM_FIELDS.forEach((f) => { payload[f] = $(f).value.trim(); });

    const editId = $("editStudentId").value;

    try {
        if (editId) {
            await api("/students/" + editId, { method: "PUT", body: JSON.stringify(payload) });
            notify("Student updated.");
        } else {
            await api("/students", { method: "POST", body: JSON.stringify(payload) });
            notify("Student saved.");
        }
        resetForm();
        await loadStudents();
        showSection("directory");
    } catch (error) {
        notify(error.message, "danger");
    }
}

async function deleteStudent(id) {
    const s = students.find((x) => Number(x.id) === Number(id));
    const name = s ? s.firstName + " " + s.surname : "this student";
    if (!confirm("Delete " + name + "? This cannot be undone.")) return;

    try {
        await api("/students/" + id, { method: "DELETE" });
        notify("Student deleted.");
        await loadStudents();
    } catch (error) {
        notify(error.message, "danger");
    }
}

// -------------------------------
// EXPORT / BACKUP / RESTORE
// -------------------------------
function exportToExcel() {
    if (students.length === 0) {
        notify("There are no students to export.", "danger");
        return;
    }

    const rows = students.map((s) => ({
        "Adm No": s.admNo,
        "First Name": s.firstName,
        "Surname": s.surname,
        "DOB": s.dob,
        "Gender": s.gender,
        "Class": s.className,
        "Father's Name": s.fatherName,
        "Father's Phone": s.fatherPhone,
        "Mother's Name": s.motherName,
        "Mother's Phone": s.motherPhone,
        "Guardian's Name": s.guardianName,
        "Guardian's Phone": s.guardianPhone,
        "Address": s.address
    }));

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Students");
    XLSX.writeFile(book, "MAGMAX_Students.xlsx");
}

function downloadBackup() {
    const blob = new Blob([JSON.stringify(students, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "magmax_backup_" + new Date().toISOString().slice(0, 10) + ".json";
    link.click();
    URL.revokeObjectURL(link.href);
}

async function restoreBackup() {
    const file = $("backupFile").files[0];
    if (!file) {
        notify("Choose a backup .json file first.", "danger");
        return;
    }

    let records;
    try {
        records = JSON.parse(await file.text());
        if (!Array.isArray(records)) throw new Error();
    } catch (err) {
        notify("That file is not a valid backup.", "danger");
        return;
    }

    if (!confirm("Restore " + records.length + " records? Students whose admission number already exists will be skipped.")) {
        return;
    }

    let added = 0;
    let skipped = 0;

    for (const record of records) {
        try {
            await api("/students", { method: "POST", body: JSON.stringify(record) });
            added++;
        } catch (error) {
            skipped++;
        }
    }

    $("backupFile").value = "";
    await loadStudents();
    notify("Restore finished: " + added + " added, " + skipped + " skipped.");
}

// -------------------------------
// Make functions available to HTML onclick attributes
// -------------------------------
window.showSection = showSection;
window.logout = logout;
window.refreshData = refreshData;
window.renderDirectory = renderDirectory;
window.showRoster = showRoster;
window.editStudent = editStudent;
window.deleteStudent = deleteStudent;
window.exportToExcel = exportToExcel;
window.downloadBackup = downloadBackup;
window.restoreBackup = restoreBackup;