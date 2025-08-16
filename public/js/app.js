let currentUser = null;
let tasks = [];
let users = [];
let allTasks = [];
let userTasks = [];

// Utility function to get local date string without timezone issues
function getLocalDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
    const savedUserId = localStorage.getItem('userId');
    
    users = await fetchUsers();
    allTasks = await fetchTasks();
    
    if (savedUserId) {
        currentUser = users.find(u => u.id === parseInt(savedUserId));
        if (currentUser) {
            tasks = await fetchUserTasks(currentUser.id);
            showMainApp();
        } else {
            showUserSelection();
        }
    } else {
        showUserSelection();
    }
    
    setupEventListeners();
    updateCurrentDate();
}

function setupEventListeners() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => switchTab(e.target.dataset.tab));
    });
}

async function fetchUsers() {
    try {
        const response = await fetch('/api/users');
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        return response.json();
    } catch (error) {
        console.error('Error fetching users:', error);
        return [];
    }
}

async function fetchTasks() {
    try {
        const response = await fetch('/api/tasks');
        if (!response.ok) {
            throw new Error('Failed to fetch tasks');
        }
        return response.json();
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }
}

async function fetchUserTasks(userId) {
    try {
        const response = await fetch(`/api/tasks/user/${userId}`);
        if (!response.ok) {
            throw new Error('Failed to fetch user tasks');
        }
        return response.json();
    } catch (error) {
        console.error('Error fetching user tasks:', error);
        return [];
    }
}

function showUserSelection() {
    console.log('Showing user selection, users:', users);
    document.getElementById('user-selection').classList.remove('hidden');
    document.getElementById('main-app').classList.add('hidden');
    
    // Ensure user info shows "None" when on login page
    const userInfo = document.getElementById('user-info');
    if (userInfo) {
        userInfo.textContent = '登入身份：None';
        userInfo.style.cursor = 'default';
        userInfo.title = '';
        userInfo.onclick = null;
    }
    
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';
    
    if (users.length === 0) {
        userList.innerHTML = '<p style="color: #e74c3c;">無法載入用戶列表，請確認伺服器是否運行中</p>';
        return;
    }
    
    users.forEach(user => {
        const btn = document.createElement('button');
        btn.className = 'user-btn';
        btn.textContent = user.name;
        btn.onclick = () => {
            console.log('Button clicked for user:', user);
            selectUser(user);
        };
        btn.addEventListener('click', () => {
            console.log('Event listener triggered for user:', user);
            selectUser(user);
        });
        userList.appendChild(btn);
    });
}

async function selectUser(user) {
    console.log('Selecting user:', user);
    try {
        currentUser = user;
        localStorage.setItem('userId', user.id);
        tasks = await fetchUserTasks(user.id);
        console.log('User tasks loaded:', tasks);
        showMainApp();
    } catch (error) {
        console.error('Error selecting user:', error);
        alert('登入失敗，請稍後再試');
    }
}

function showMainApp() {
    console.log('Showing main app for user:', currentUser);
    
    const userSelection = document.getElementById('user-selection');
    const mainApp = document.getElementById('main-app');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (!userSelection || !mainApp) {
        console.error('Required elements not found');
        return;
    }
    
    userSelection.classList.add('hidden');
    mainApp.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    
    document.getElementById('user-info').textContent = `登入身份：${currentUser.name}`;
    
    if (currentUser.isAdmin) {
        const adminConfigTab = document.querySelector('[data-tab="admin-config"]');
        if (adminConfigTab) adminConfigTab.classList.remove('hidden');
    }
    
    loadDailyTasks();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('hidden', pane.id !== tabName);
    });
    
    switch(tabName) {
        case 'check-in':
            loadDailyTasks();
            break;
        case 'my-progress':
            loadMyProgress();
            break;
        case 'team-progress':
            loadTeamProgress();
            break;
        case 'statistics':
            loadStatistics();
            break;
        case 'admin-config':
            loadAdminConfigPanel();
            break;
    }
}

function updateCurrentDate() {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = today.toLocaleDateString('en-US', options);
}

async function loadDailyTasks() {
    const tasksList = document.getElementById('tasks-list');
    tasksList.innerHTML = '';
    
    const today = getLocalDateString();
    const completions = await fetchCompletions(currentUser.id);
    
    tasks.forEach(task => {
        const taskItem = document.createElement('div');
        taskItem.className = 'task-item';
        
        const completion = completions.find(c => c.taskId === task.id && c.date === today);
        const isCompleted = completion ? completion.completed : false;
        
        taskItem.innerHTML = `
            <label>
                <input type="checkbox" ${isCompleted ? 'checked' : ''} 
                       onchange="toggleTask(${task.id}, '${today}', this.checked)">
                <span>${task.name}</span>
            </label>
        `;
        
        tasksList.appendChild(taskItem);
    });
}

async function toggleTask(taskId, date, completed) {
    await fetch('/api/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: currentUser.id,
            taskId,
            date,
            completed
        })
    });
}

async function fetchCompletions(userId) {
    const response = await fetch(`/api/completions/${userId}`);
    return response.json();
}

async function loadMyProgress() {
    const weekGrid = document.getElementById('weekly-grid');
    const completions = await fetchCompletions(currentUser.id);
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const calendarHtml = generateWeeklyRowCalendarView(year, month, [currentUser], completions, tasks, false);
    weekGrid.innerHTML = calendarHtml;
}

async function loadTeamProgress() {
    const teamGrid = document.getElementById('team-grid');
    
    const exerciseTask = allTasks.find(t => t.name === '每日運動');
    if (!exerciseTask) {
        teamGrid.innerHTML = '<p>找不到每日運動任務</p>';
        return;
    }
    
    // Fetch all users' completions
    const allCompletions = [];
    for (const user of users) {
        const userCompletions = await fetchCompletions(user.id);
        allCompletions.push(...userCompletions);
    }
    
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const calendarHtml = generateWeeklyRowCalendarView(year, month, users, allCompletions, [exerciseTask], true);
    teamGrid.innerHTML = calendarHtml;
}

async function loadStatistics() {
    // Update the title to show yearly view
    const currentYear = new Date().getFullYear();
    const titleElement = document.getElementById('statistics-title');
    if (titleElement) {
        titleElement.textContent = `${currentYear}年統計`;
    }
    
    const statsContainer = document.getElementById('stats-container');
    const yearlyStats = await fetch('/api/statistics').then(r => r.json());
    
    if (yearlyStats.length === 0) {
        statsContainer.innerHTML = '<p>暫無統計資料</p>';
        return;
    }
    
    // Get all users from the current month data
    const currentMonthData = yearlyStats.find(month => month.isCurrent) || yearlyStats[0];
    const users = currentMonthData.users;
    
    let html = '';
    
    // First, display all users in the top row
    html += `<div class="users-overview-section">`;
    html += `<div class="users-grid">`;
    
    users.forEach(userStat => {
        const encouragementMessage = userStat.completionRate >= 50 ? 
            '妳真是太棒了!' : '加油...FIGHTING!';
        
        const completedDays = userStat.completedDays || userStat.completedTasks || 0;
        const heartIcon = userStat.completionRate > 50 ? ' ❤️' : '';
        
        // Build task breakdown display for current month
        let taskBreakdownHtml = '';
        if (userStat.taskBreakdown && userStat.taskBreakdown.length > 0) {
            taskBreakdownHtml = userStat.taskBreakdown.map(task => 
                `<div class="task-breakdown-item">
                    <span class="task-name">${task.taskName}</span>
                    <span class="task-stats">${task.completedDays}天 (${task.completionRate}%)</span>
                </div>`
            ).join('');
        }
        
        html += `
            <div class="user-stat-card">
                <h3>${userStat.userName}</h3>
                <div class="stat-value">${userStat.completionRate}%</div>
                <div class="stat-label">當月完成率</div>
                <div class="combo-text">達成任務${completedDays}天${heartIcon}</div>
                <div class="task-breakdown">
                    ${taskBreakdownHtml}
                </div>
                <div class="encouragement-message">${encouragementMessage}</div>
            </div>
        `;
    });
    
    html += `</div>`; // Close users-grid
    html += `</div>`; // Close users-overview-section
    
    // Then display monthly history below
    html += `<div class="monthly-history-section">`;
    html += `<h3>月份歷史記錄</h3>`;
    
    yearlyStats.forEach((monthData, index) => {
        const isCurrentMonth = monthData.isCurrent;
        const monthClass = isCurrentMonth ? 'current-month' : 'past-month';
        
        html += `<div class="month-row ${monthClass}">`;
        html += `<div class="month-label">
            <span class="month-name">${monthData.monthName}</span>
            ${isCurrentMonth ? '<span class="current-badge">當前</span>' : ''}
        </div>`;
        
        html += `<div class="month-users-grid">`;
        
        // Display each user's stats for this month in a compact format
        monthData.users.forEach(userStat => {
            const completedDays = userStat.completedDays || userStat.completedTasks || 0;
            const heartIcon = userStat.completionRate > 50 ? ' ❤️' : '';
            
            html += `
                <div class="month-user-stat">
                    <div class="user-name">${userStat.userName}</div>
                    <div class="user-rate">${userStat.completionRate}%${heartIcon}</div>
                    <div class="user-days">${completedDays}天</div>
                </div>
            `;
        });
        
        html += `</div>`; // Close month-users-grid
        html += `</div>`; // Close month-row
    });
    
    html += `</div>`; // Close monthly-history-section
    
    statsContainer.innerHTML = html;
}


function getWeekDays() {
    const today = new Date();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - currentDay + (currentDay === 0 ? -6 : 1));
    
    const weekDays = [];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        weekDays.push({
            dayName: dayNames[i],
            date: date.getDate(),
            dateStr: date.toISOString().split('T')[0]
        });
    }
    
    return weekDays;
}

function getMonthDays() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const monthDays = [];
    for (let i = 1; i <= daysInMonth; i++) {
        const date = new Date(year, month, i);
        monthDays.push({
            date: i,
            dateStr: date.toISOString().split('T')[0]
        });
    }
    
    return monthDays;
}

function generateCalendarView(year, month, usersToShow, completions, tasksToShow, isTeamView) {
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                       '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());
    
    const today = new Date();
    const todayStr = getLocalDateString(today);
    
    let html = `<div class="calendar-container">`;
    html += `<div class="calendar-header">${year}年 ${monthNames[month]}</div>`;
    html += `<div class="calendar-grid">`;
    
    // Day headers
    dayNames.forEach(dayName => {
        html += `<div class="calendar-day-header">${dayName}</div>`;
    });
    
    // Calendar days
    const currentDate = new Date(startDate);
    for (let week = 0; week < 6; week++) {
        for (let day = 0; day < 7; day++) {
            const dateStr = getLocalDateString(currentDate);
            const dayNum = currentDate.getDate();
            const isCurrentMonth = currentDate.getMonth() === month;
            const isToday = dateStr === todayStr;
            
            let dayClass = 'calendar-day';
            if (!isCurrentMonth) dayClass += ' other-month';
            if (isToday) dayClass += ' today';
            if (isTeamView) dayClass += ' exercise-only';
            
            html += `<div class="${dayClass}">`;
            html += `<div class="day-number">${dayNum}</div>`;
            html += `<div class="user-status-list">`;
            
            // Show user completion status for this date
            usersToShow.forEach(user => {
                tasksToShow.forEach(task => {
                    const completion = completions.find(c => 
                        c.userId === user.id && 
                        c.taskId === task.id && 
                        c.date === dateStr
                    );
                    
                    let statusIcon = '○';
                    let statusClass = 'status-pending';
                    
                    if (completion) {
                        if (completion.completed) {
                            statusIcon = '✓';
                            statusClass = 'status-completed';
                        } else {
                            statusIcon = '✗';
                            statusClass = 'status-not-completed';
                        }
                    }
                    
                    html += `<div class="user-status-item">`;
                    html += `<span class="user-name">${user.name}</span>`;
                    html += `<span class="status-icon ${statusClass}">${statusIcon}</span>`;
                    html += `</div>`;
                });
            });
            
            html += `</div>`;
            html += `</div>`;
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        // Stop if we've gone past the current month
        if (currentDate.getMonth() !== month && week >= 4) {
            break;
        }
    }
    
    html += `</div>`;
    html += `</div>`;
    
    return html;
}

function generateWeeklyRowCalendarView(year, month, usersToShow, completions, tasksToShow, isTeamView) {
    const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                       '七月', '八月', '九月', '十月', '十一月', '十二月'];
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
    
    const today = new Date();
    const todayStr = getLocalDateString(today);
    
    // Get all days of the current month, organized by weeks
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday of first week
    
    // Generate all weeks of the month
    const allWeeks = [];
    const currentDate = new Date(startDate);
    
    while (currentDate <= lastDay || (currentDate.getMonth() === month)) {
        const week = [];
        for (let i = 0; i < 7; i++) {
            const dateStr = getLocalDateString(currentDate);
            const dayNum = currentDate.getDate();
            const isCurrentMonth = currentDate.getMonth() === month;
            const isToday = dateStr === todayStr;
            
            week.push({
                dayName: dayNames[i],
                date: dayNum,
                dateStr: dateStr,
                isToday: isToday,
                isCurrentMonth: isCurrentMonth
            });
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        allWeeks.push(week);
        
        // Stop if we've gone past the current month and have at least 4 weeks
        if (currentDate.getMonth() > month && allWeeks.length >= 4) {
            break;
        }
    }
    
    let html = `<div class="weekly-tables-container">`;
    html += `<div class="month-header">${year}年 ${monthNames[month]}</div>`;
    
    // Create a separate table for each week
    allWeeks.forEach((week, weekIndex) => {
        html += `<div class="week-table-section">`;
        html += `<table class="week-table">`;
        
        // Header row with day names and dates (only for first week)
        html += `<thead>`;
        if (weekIndex === 0) {
            html += `<tr class="day-names-row">`;
            html += `<th class="name-column">${isTeamView ? '成員' : '任務'}</th>`;
            week.forEach(day => {
                html += `<th class="day-name-header">${day.dayName}</th>`;
            });
            html += `</tr>`;
        }
        
        html += `<tr class="dates-row">`;
        html += `<th class="name-column-dates">${weekIndex === 0 ? '' : '&nbsp;'}</th>`;
        week.forEach(day => {
            const headerClass = day.isToday ? 'today-header' : '';
            const monthClass = !day.isCurrentMonth ? 'other-month' : '';
            html += `<th class="date-header ${headerClass} ${monthClass}">${day.date}</th>`;
        });
        html += `</tr>`;
        html += `</thead>`;
        
        // Body rows - one row per user/task
        html += `<tbody>`;
        
        if (isTeamView) {
            usersToShow.forEach(user => {
                html += `<tr class="user-row">`;
                html += `<td class="name-cell">${user.name}</td>`;
                
                week.forEach(day => {
                    const completion = completions.find(c => 
                        c.userId === user.id && 
                        c.taskId === tasksToShow[0].id && 
                        c.date === day.dateStr
                    );
                    
                    let statusClass = 'status-pending';
                    let statusIcon = '○';
                    
                    if (completion) {
                        if (completion.completed) {
                            statusClass = 'status-completed';
                            statusIcon = '✓';
                        } else {
                            statusClass = 'status-not-completed';
                            statusIcon = '✗';
                        }
                    }
                    
                    const cellClass = day.isToday ? 'today-cell' : '';
                    const monthClass = !day.isCurrentMonth ? 'other-month-cell' : '';
                    html += `<td class="status-cell ${statusClass} ${cellClass} ${monthClass}">${statusIcon}</td>`;
                });
                
                html += `</tr>`;
            });
        } else {
            tasksToShow.forEach(task => {
                html += `<tr class="task-row">`;
                html += `<td class="name-cell">${task.name}</td>`;
                
                week.forEach(day => {
                    const completion = completions.find(c => 
                        c.userId === usersToShow[0].id && 
                        c.taskId === task.id && 
                        c.date === day.dateStr
                    );
                    
                    let statusClass = 'status-pending';
                    let statusIcon = '○';
                    
                    if (completion) {
                        if (completion.completed) {
                            statusClass = 'status-completed';
                            statusIcon = '✓';
                        } else {
                            statusClass = 'status-not-completed';
                            statusIcon = '✗';
                        }
                    }
                    
                    const cellClass = day.isToday ? 'today-cell' : '';
                    const monthClass = !day.isCurrentMonth ? 'other-month-cell' : '';
                    html += `<td class="status-cell ${statusClass} ${cellClass} ${monthClass}">${statusIcon}</td>`;
                });
                
                html += `</tr>`;
            });
        }
        
        html += `</tbody>`;
        html += `</table>`;
        html += `</div>`; // week-table-section
    });
    
    html += `</div>`;
    
    return html;
}

async function loadAdminConfigPanel() {
    try {
        console.log('Loading admin config panel...');
        // Ensure we have fresh data
        users = await fetchUsers();
        console.log('Fetched users:', users);
        allTasks = await fetchTasks();
        console.log('Fetched tasks:', allTasks);
        await loadUserTaskManagement();
    } catch (error) {
        console.error('Error loading admin config panel:', error);
        const managementDiv = document.getElementById('user-task-management');
        if (managementDiv) {
            managementDiv.innerHTML = '<p style="color: red;">載入失敗，請重新整理頁面或檢查伺服器連線</p>';
        }
    }
}

async function loadUserTaskManagement() {
    console.log('Loading user task management...');
    console.log('Users:', users);
    console.log('All tasks:', allTasks);
    
    const managementDiv = document.getElementById('user-task-management');
    if (!managementDiv) {
        console.error('Management div not found');
        return;
    }
    
    const userTaskData = await fetch('/api/user-tasks').then(r => r.json());
    console.log('User task data:', userTaskData);
    
    let html = '';
    
    for (const user of users) {
        console.log(`Processing user: ${user.name}`);
        const userTasks = userTaskData
            .filter(ut => ut.userId === user.id)
            .map(ut => allTasks.find(t => t.id === ut.taskId))
            .filter(t => t); // Remove undefined tasks
        
        console.log(`User ${user.name} tasks:`, userTasks);
        
        html += `<div class="user-section">`;
        html += `<div class="user-header">`;
        html += `<h4>${user.name}`;
        if (user.isAdmin) {
            html += `<span class="admin-badge">管理員</span>`;
        }
        html += `</h4>`;
        html += `<div class="action-buttons">`;
        html += `<button class="btn-add" onclick="addUser()">新增用戶</button>`;
        html += `<button class="btn-edit" onclick="editUser(${user.id}, '${user.name}', ${user.isAdmin})">編輯</button>`;
        html += `<button class="btn-delete" onclick="deleteUser(${user.id})">刪除</button>`;
        html += `</div>`;
        html += `</div>`;
        html += `<div class="user-body">`;
        html += `<div class="task-list">`;
        
        if (userTasks.length === 0) {
            html += `<p style="color: #7f8c8d; font-style: italic;">此用戶尚未分配任務</p>`;
        } else {
            userTasks.forEach(task => {
                html += `<div class="task-item">`;
                html += `<div class="task-name">${task.name}</div>`;
                html += `<div class="action-buttons">`;
                html += `<button class="btn-add" onclick="addTaskToUser(${user.id})">新增</button>`;
                html += `<button class="btn-edit" onclick="editTask(${user.id}, ${task.id}, '${task.name}')">編輯</button>`;
                html += `<button class="btn-delete" onclick="deleteTaskFromUser(${user.id}, ${task.id})">移除</button>`;
                html += `<button class="btn-delete-task" onclick="deleteTask(${task.id})">完全刪除</button>`;
                html += `</div>`;
                html += `</div>`;
            });
        }
        
        html += `</div>`;
        html += `</div>`;
        html += `</div>`;
    }
    
    console.log('Generated HTML:', html);
    managementDiv.innerHTML = html;
}

async function toggleUserTask(userId, taskId, assigned) {
    const method = assigned ? 'POST' : 'DELETE';
    await fetch('/api/user-tasks', {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taskId })
    });
}

async function editTask(taskId, currentName) {
    const newName = prompt('輸入新的任務名稱:', currentName);
    if (newName && newName !== currentName) {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        
        if (response.ok) {
            allTasks = await fetchTasks();
            loadConfigPanel();
            alert('任務已更新');
        }
    }
}

async function deleteTask(taskId) {
    if (confirm('確定要完全刪除這個任務嗎？此操作將移除所有用戶的此任務及其完成記錄。')) {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            allTasks = await fetchTasks();
            loadAdminConfigPanel();
            alert('任務已完全刪除');
        } else {
            alert('刪除任務失敗');
        }
    }
}

async function addNewUser() {
    const nameInput = document.getElementById('new-user-name');
    const isAdminInput = document.getElementById('new-user-admin');
    const name = nameInput.value.trim();
    
    if (!name) {
        alert('請輸入用戶名稱');
        return;
    }
    
    const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name,
            isAdmin: isAdminInput.checked
        })
    });
    
    if (response.ok) {
        users = await fetchUsers();
        nameInput.value = '';
        isAdminInput.checked = false;
        loadUserManagement();
        showUserSelection(); // Refresh login page if visible
        alert('用戶已新增');
    }
}

async function editUser(userId, currentName, currentIsAdmin) {
    const newName = prompt('輸入新的用戶名稱:', currentName);
    if (newName && newName !== currentName) {
        const isAdmin = confirm('設為管理員？');
        
        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName, isAdmin })
        });
        
        if (response.ok) {
            users = await fetchUsers();
            loadUserManagement();
            showUserSelection(); // Refresh login page if visible
            alert('用戶已更新');
        }
    }
}

async function deleteUser(userId) {
    if (confirm('確定要刪除這個用戶嗎？這將同時刪除該用戶的所有記錄。')) {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            users = await fetchUsers();
            loadUserManagement();
            showUserSelection(); // Refresh login page if visible
            
            // If deleted user is current user, logout
            if (currentUser && currentUser.id === userId) {
                localStorage.removeItem('userId');
                location.reload();
            }
            
            alert('用戶已刪除');
        }
    }
}

async function addUserTask(userId) {
    const input = document.getElementById(`new-task-${userId}`);
    const taskName = input.value.trim();
    
    if (!taskName) {
        alert('請輸入任務名稱');
        return;
    }
    
    // First create the task
    const taskResponse = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: taskName,
            userId: currentUser.id,
            isCommon: false
        })
    });
    
    if (taskResponse.ok) {
        const newTask = await taskResponse.json();
        
        // Then assign it to the user
        await fetch('/api/user-tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                taskId: newTask.id
            })
        });
        
        allTasks = await fetchTasks();
        input.value = '';
        loadAdminConfigPanel();
        alert('任務已新增並分配給用戶');
    }
}

async function editUserTask(userId, taskId, currentName) {
    const newName = prompt('輸入新的任務名稱:', currentName);
    if (newName && newName !== currentName) {
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        
        if (response.ok) {
            allTasks = await fetchTasks();
            loadAdminConfigPanel();
            alert('任務已更新');
        }
    }
}

async function removeUserTask(userId, taskId) {
    if (confirm('確定要從此用戶移除這個任務嗎？')) {
        await fetch('/api/user-tasks', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, taskId })
        });
        
        loadAdminConfigPanel();
        alert('任務已從用戶移除');
    }
}

// New functions for the simplified interface
async function addUser() {
    const userName = prompt('輸入新用戶名稱:');
    if (!userName || !userName.trim()) {
        return;
    }
    
    const isAdmin = confirm('設為管理員？');
    
    const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: userName.trim(),
            isAdmin: isAdmin
        })
    });
    
    if (response.ok) {
        users = await fetchUsers();
        loadAdminConfigPanel();
        showUserSelection(); // Refresh login page
        alert('用戶已新增');
    } else {
        alert('新增用戶失敗');
    }
}

async function addTaskToUser(userId) {
    const taskName = prompt('輸入新任務名稱:');
    if (!taskName || !taskName.trim()) {
        return;
    }
    
    // First create the task
    const taskResponse = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: taskName.trim(),
            userId: currentUser.id,
            isCommon: false
        })
    });
    
    if (taskResponse.ok) {
        const newTask = await taskResponse.json();
        
        // Then assign it to the user
        await fetch('/api/user-tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: userId,
                taskId: newTask.id
            })
        });
        
        allTasks = await fetchTasks();
        
        // If the task was added to the current user, refresh their task list
        if (userId === currentUser.id) {
            tasks = await fetchUserTasks(currentUser.id);
            loadDailyTasks(); // Refresh the daily check-in page
        }
        
        loadAdminConfigPanel();
        alert('任務已新增並分配給用戶');
    } else {
        alert('新增任務失敗');
    }
}

async function editTask(userId, taskId, currentName) {
    const newName = prompt('輸入新的任務名稱:', currentName);
    if (!newName || !newName.trim() || newName === currentName) {
        return;
    }
    
    const response = await fetch(`/api/tasks/${taskId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
    });
    
    if (response.ok) {
        allTasks = await fetchTasks();
        loadAdminConfigPanel();
        alert('任務已更新');
    } else {
        alert('更新任務失敗');
    }
}

async function deleteTaskFromUser(userId, taskId) {
    if (!confirm('確定要從此用戶刪除這個任務嗎？')) {
        return;
    }
    
    await fetch('/api/user-tasks', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, taskId })
    });
    
    loadAdminConfigPanel();
    alert('任務已從用戶刪除');
}

function logout() {
    localStorage.removeItem('userId');
    currentUser = null;
    tasks = [];
    
    const userSelection = document.getElementById('user-selection');
    const mainApp = document.getElementById('main-app');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    
    if (userSelection) userSelection.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    
    // Clear user info display and remove logout functionality
    if (userInfo) {
        userInfo.textContent = '登入身份：None';
        userInfo.style.cursor = 'default';
        userInfo.title = '';
        userInfo.onclick = null;
    }
    
    showUserSelection();
}
console.log('Statistics updated - 西元2025年08月17日 (星期日) 02時10分00秒');