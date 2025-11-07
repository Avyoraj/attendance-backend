let allRecords = [];

function getRSSIClass(rssi) {
  if (!rssi) return 'rssi-weak';
  if (rssi > -60) return 'rssi-strong';
  if (rssi > -75) return 'rssi-medium';
  return 'rssi-weak';
}

function formatDistance(distance) {
  if (!distance) return '-';
  return distance.toFixed(1) + 'm';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleString();
}

function updateStats() {
  const provisional = allRecords.filter(r => r.status === 'provisional').length;
  const confirmed = allRecords.filter(r => r.status === 'confirmed').length;
  const uniqueStudents = new Set(allRecords.map(r => r.studentId)).size;

  document.getElementById('total-count').textContent = allRecords.length;
  document.getElementById('provisional-count').textContent = provisional;
  document.getElementById('confirmed-count').textContent = confirmed;
  document.getElementById('student-count').textContent = uniqueStudents;
}

function renderTable(records) {
  const tbody = document.getElementById('attendance-body');

  if (records.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">No attendance records found</td></tr>';
    return;
  }

  tbody.innerHTML = records
    .map(
      (record) => `
        <tr>
          <td><strong>${record.studentId}</strong></td>
          <td>${record.classId}</td>
          <td><span class="status ${record.status}">${record.status.toUpperCase()}</span></td>
          <td>${formatDate(record.checkInTime)}</td>
          <td>${formatDate(record.confirmedAt)}</td>
          <td><span class="rssi-indicator ${getRSSIClass(record.rssi)}">${record.rssi || '-'} dBm</span></td>
          <td>${formatDistance(record.distance)}</td>
          <td class="device-icon" title="${record.deviceId || 'Not registered'}">
            ${record.deviceId ? '🔒' : '🔓'}
          </td>
        </tr>
      `
    )
    .join('');
}

function applyFilters() {
  const statusFilter = document.getElementById('status-filter').value;
  const studentFilter = document.getElementById('student-filter').value.toLowerCase();
  const classFilter = document.getElementById('class-filter').value.toLowerCase();

  const filtered = allRecords.filter((record) => {
    const matchStatus = !statusFilter || record.status === statusFilter;
    const matchStudent = !studentFilter || record.studentId.toLowerCase().includes(studentFilter);
    const matchClass = !classFilter || record.classId.toLowerCase().includes(classFilter);
    return matchStatus && matchStudent && matchClass;
  });

  renderTable(filtered);
}

async function fetchAttendance() {
  try {
    const response = await fetch('/api/attendance?limit=500');
    const data = await response.json();

    allRecords = data.attendance || [];
    updateStats();
    applyFilters();

    document.getElementById('last-updated').textContent = new Date().toLocaleTimeString();
  } catch (error) {
    console.error('Failed to fetch attendance:', error);
    document.getElementById('attendance-body').innerHTML =
      '<tr><td colspan="8" style="color: red; text-align: center;">Failed to load data</td></tr>';
  }
}

// Event listeners
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('status-filter').addEventListener('change', applyFilters);
  document.getElementById('student-filter').addEventListener('input', applyFilters);
  document.getElementById('class-filter').addEventListener('input', applyFilters);

  // Initial fetch
  fetchAttendance();

  // Auto-refresh every 10 seconds
  setInterval(fetchAttendance, 10000);
});
