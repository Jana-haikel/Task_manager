$(document).ready(function() {
    
    // ============ CONFIG & STATE ============    
    const API_URL = 'api/api.php';
    const state = { editId: null, calendarDate: new Date(), tasks: [], todos: [] };
    
    // ============ DOM CACHE ============
    const $ = selector => document.querySelector(selector);
    const $$ = selector => document.querySelectorAll(selector);
    const $j = jQuery; // Alias for jQuery to avoid conflict with vanilla $
    
    const dom = {
        form: $('#taskForm'),
        title: $('#taskTitle'),
        desc: $('#taskDesc'),
        deadline: $('#taskDeadline'),
        pending: $('#pendingTasks'),
        completed: $('#completedTasks')
    };
    
    // ============ UTILITIES ============
    const api = {
        get: action => $j.getJSON(`${API_URL}?action=${action}`),
        post: (action, data) => $j.ajax({ url: `${API_URL}?action=${action}`, method: 'POST', contentType: 'application/json', data: JSON.stringify(data) }),
        put: (action, id, data) => $j.ajax({ url: `${API_URL}?action=${action}&id=${id}`, method: 'PUT', contentType: 'application/json', data: JSON.stringify(data) }),
        patch: (action, id) => $j.ajax({ url: `${API_URL}?action=${action}&id=${id}`, method: 'PATCH' }),
        delete: (action, id) => $j.ajax({ url: `${API_URL}?action=${action}&id=${id}`, method: 'DELETE' })
    };
    
    const escape = text => Object.assign(document.createElement('div'), { textContent: text || '' }).innerHTML;
    
    const formatDate = date => new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    
    const compareIds = (a, b) => String(a) === String(b);
    
    const findTask = (arr, id) => arr.find(t => compareIds(t.id, id));
    
    /*
     * Element factory - Creates DOM elements with attributes and children
     * Vanilla JS DOM manipulation
     */
    const el = (tag, attrs = {}, children = []) => {
        const element = document.createElement(tag);
        
        Object.entries(attrs).forEach(([key, val]) => {
            if (key === 'class') element.className = val;
            else if (key === 'text') element.textContent = val;
            else if (key === 'html') element.innerHTML = val;
            else if (key === 'style' && typeof val === 'object') Object.assign(element.style, val);
            else if (key === 'data') Object.entries(val).forEach(([k, v]) => element.dataset[k] = v);
            else if (key === 'events') Object.entries(val).forEach(([evt, fn]) => element.addEventListener(evt, fn));
            else if (key === '_ref') val.current = element;
            else element.setAttribute(key, val);
        });
        
        children.forEach(child => {
            if (child) element.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        
        return element;
    };
    
    /**
     * Show notification - Vanilla JS element creation and animation
     */
    const notify = (msg, type = 'success') => {
        $$('.notification').forEach(n => n.remove());
        
        const note = el('div', {
            class: `notification notification-${type}`,
            style: { opacity: '0', transform: 'translateY(-20px)' }
        }, [
            el('span', { text: msg }),
            el('button', { 
                class: 'notification-close', 
                html: '&times;',
                events: { click: () => removeNote(note) }
            })
        ]);
        
        document.body.appendChild(note);
        requestAnimationFrame(() => Object.assign(note.style, { 
            transition: 'all 0.3s', opacity: '1', transform: 'translateY(0)' 
        }));
        setTimeout(() => document.body.contains(note) && removeNote(note), 3000);
    };
    
    const removeNote = note => {
        Object.assign(note.style, { opacity: '0', transform: 'translateY(-20px)' });
        setTimeout(() => note.remove(), 300);
    };
    
    // ============ NAVIGATION - jQuery ============
    $j('.nav-btn').on('click', function() {
        const page = $j(this).data('page');
        
        // jQuery class manipulation
        $j('.nav-btn').removeClass('active').attr('aria-selected', 'false');
        $j(this).addClass('active').attr('aria-selected', 'true');
        
        // jQuery show/hide pages
        $j('.page').removeClass('active').attr('aria-hidden', 'true');
        $j(`#${page}-page`).addClass('active').attr('aria-hidden', 'false');
        
        if (page === 'calendar') renderCalendar();
    });
    
    // ============ TASK FORM ============
    const openForm = (task = null) => {
        state.editId = task?.id || null;
        
        // jQuery text manipulation
        $j('#formTitle').text(task ? 'Edit Task' : 'New Task');
        $j('#submitTaskBtn').text(task ? 'Update Task' : 'Add Task');
        
        // Vanilla JS value setting
        dom.title.value = task?.title || '';
        dom.desc.value = task?.description || '';
        dom.deadline.value = task?.deadline || '';
        dom.title.className = '';
        
        // jQuery class manipulation
        $j('#taskForm').removeClass('hidden');
        dom.title.focus();
        task && dom.title.select();
    };
    
    const closeForm = () => {
        $j('#taskForm').addClass('hidden');
        state.editId = null;
        dom.title.style.borderColor = '';
    };
    
    const validateTitle = () => {
        const valid = dom.title.value.trim().length > 0;
        // Vanilla JS style manipulation
        dom.title.style.borderColor = dom.title.value ? (valid ? '#10b981' : '#ef4444') : '';
        dom.title.classList.toggle('valid', valid);
        dom.title.classList.toggle('invalid', !valid && dom.title.value.length > 0);
        return valid;
    };
    
    const submitForm = () => {
        if (!validateTitle()) return notify('Please enter a title', 'error');
        
        const data = {
            title: dom.title.value.trim(),
            description: dom.desc.value.trim(),
            deadline: dom.deadline.value
        };
        
        // Vanilla JS attribute manipulation
        const btn = $('#submitTaskBtn');
        const origText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Saving...';
        
        (state.editId ? api.put('task', state.editId, data) : api.post('tasks', data))
            .done(() => { closeForm(); renderAll(); notify(state.editId ? 'Task updated!' : 'Task created!'); })
            .fail(() => notify('Failed to save task', 'error'))
            .always(() => { btn.disabled = false; btn.textContent = origText; });
    };
    
    // Form event bindings - Mixed jQuery and Vanilla JS
    $j('#addTaskBtn').on('click', () => openForm());
    $j('#closeFormBtn').on('click', closeForm);
    $j('#submitTaskBtn').on('click', submitForm);
    
    // Vanilla JS keyboard events
    dom.form.addEventListener('keydown', e => {
        if (e.key === 'Escape') closeForm();
        if (e.key === 'Enter' && e.ctrlKey) submitForm();
    });
    dom.title.addEventListener('input', validateTitle);
    
    // ============ TASK CARD CREATION - Vanilla JS ============
    const createTaskCard = task => {
        const card = el('div', {
            class: `task-card ${task.completed ? 'completed' : ''}`,
            data: { id: task.id },
            role: 'article',
            events: {
                mouseenter: e => Object.assign(e.currentTarget.style, { transform: 'translateY(-2px)', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }),
                mouseleave: e => Object.assign(e.currentTarget.style, { transform: '', boxShadow: '' })
            }
        }, [
            el('div', { class: 'task-card-header' }, [
                el('div', {
                    class: `task-checkbox ${task.completed ? 'checked' : ''}`,
                    data: { action: 'toggle' },
                    role: 'checkbox',
                    'aria-checked': task.completed,
                    tabindex: '0',
                    text: task.completed ? '✓' : '',
                    events: {
                        keydown: e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleTask(task.id))
                    }
                }),
                el('div', { class: 'task-content' }, [
                    el('div', { class: `task-title ${task.completed ? 'completed' : ''}`, text: task.title }),
                    task.description && el('div', { class: 'task-desc', text: task.description }),
                    task.deadline && el('div', {
                        class: `task-deadline ${!task.completed && new Date(task.deadline) < new Date() ? 'overdue' : ''}`,
                        html: `📅 ${formatDate(task.deadline)}`,
                        style: !task.completed && new Date(task.deadline) < new Date() ? { color: '#ef4444' } : {}
                    })
                ].filter(Boolean)),
                el('div', { class: 'task-actions' }, [
                    el('button', { class: 'task-btn', data: { action: 'edit' }, text: 'Edit' }),
                    el('button', { class: 'task-btn delete', data: { action: 'delete' }, text: 'Delete' })
                ])
            ])
        ]);
        return card;
    };
    
    // ============ TASK OPERATIONS ============
    const toggleTask = id => {
        const card = $(`.task-card[data-id="${id}"]`);
        if (card) Object.assign(card.style, { opacity: '0.5', pointerEvents: 'none' });
        
        api.patch('task', id)
            .done(() => { renderAll(); notify('Task status updated!'); })
            .fail(() => { card && Object.assign(card.style, { opacity: '', pointerEvents: '' }); notify('Failed to update', 'error'); });
    };
    
    const deleteTask = id => {
        if (!confirm('Delete this task?')) return;
        
        const card = $(`.task-card[data-id="${id}"]`);
        if (card) Object.assign(card.style, { transition: 'all 0.3s', opacity: '0', transform: 'translateX(100%)' });
        
        setTimeout(() => {
            api.delete('task', id)
                .done(() => { renderAll(); notify('Task deleted!'); })
                .fail(() => { card && Object.assign(card.style, { opacity: '', transform: '' }); notify('Failed to delete', 'error'); });
        }, 300);
    };
    
    // ============ RENDER FUNCTIONS ============
    const renderTasks = () => {
        dom.pending.innerHTML = '<div class="loading-spinner"><span class="spinner-dot"></span><span class="spinner-dot"></span><span class="spinner-dot"></span></div>';
        
        api.get('tasks').done(tasks => {
            state.tasks = tasks;
            const pending = tasks.filter(t => !t.completed);
            const completed = tasks.filter(t => t.completed);
            
            // Vanilla JS DOM manipulation
            dom.pending.innerHTML = '';
            dom.completed.innerHTML = '';
            pending.forEach(t => dom.pending.appendChild(createTaskCard(t)));
            completed.forEach(t => dom.completed.appendChild(createTaskCard(t)));
            
            // jQuery show/hide
            $j('#emptyState')[tasks.length ? 'hide' : 'show']();
            $j('#taskLists')[tasks.length ? 'show' : 'hide']();
            
            // Vanilla JS content update
            const pendingCount = $('[data-section="pending"] .task-count');
            const completedCount = $('[data-section="completed"] .task-count');
            if (pendingCount) pendingCount.textContent = `(${pending.length})`;
            if (completedCount) completedCount.textContent = `(${completed.length})`;
        });
    };
    
    const renderQuickTodos = () => {
        api.get('todos').done(todos => {
            state.todos = todos;
            const container = $('#quickTodoList');
            container.innerHTML = '';
            
            if (!todos.length) {
                container.appendChild(el('p', { class: 'empty-todos-message', text: 'No quick todos yet. Add one!' }));
            } else {
                todos.forEach(todo => {
                    container.appendChild(el('div', { class: 'task-item', data: { id: todo.id } }, [
                        el('input', {
                            type: 'checkbox',
                            data: { action: 'toggle-todo' },
                            ...(todo.completed && { checked: 'checked' })
                        }),
                        el('span', {
                            class: 'todo-text',
                            text: todo.text,
                            style: todo.completed ? { textDecoration: 'line-through', color: '#9ca3af' } : {}
                        }),
                        el('button', { class: 'edit-btn', data: { action: 'edit-todo' }, text: 'Edit' }),
                        el('button', { class: 'delete-btn', data: { action: 'delete-todo' }, text: 'Delete' })
                    ]));
                });
            }
            
            // Update progress
            const total = todos.length;
            const done = todos.filter(t => t.completed).length;
            const percent = total ? Math.round((done / total) * 100) : 0;
            
            // jQuery text update
            $j('#progressText').text(percent + '%');
            
            // Vanilla JS SVG manipulation
            const circle = $('#progressCircle');
            if (circle) {
                const offset = 157 - (percent / 100 * 157);
                Object.assign(circle.style, { transition: 'stroke-dashoffset 0.5s' });
                circle.setAttribute('stroke-dashoffset', offset);
                circle.setAttribute('stroke', percent === 100 ? '#10b981' : percent >= 50 ? '#3b82f6' : '#f59e0b');
            }
        });
    };
    
    const renderCalendar = () => {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        api.get('tasks').done(tasks => {
            state.tasks = tasks;
            const { calendarDate } = state;
            const year = calendarDate.getFullYear();
            const month = calendarDate.getMonth();
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const today = new Date();
            const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;
            
            // Group tasks by day
            const tasksByDay = tasks.reduce((acc, task) => {
                if (!task.deadline) return acc;
                const d = new Date(task.deadline);
                if (d.getMonth() === month && d.getFullYear() === year) {
                    const day = d.getDate();
                    (acc[day] = acc[day] || []).push(task);
                }
                return acc;
            }, {});
            
            const container = $('#calendarView');
            container.innerHTML = '';
            
            // Header - Vanilla JS element creation
            container.appendChild(el('div', { class: 'calendar-header' }, [
                el('button', { class: 'calendar-nav-btn', data: { action: 'prev-month' }, text: '◀' }),
                el('h3', { class: 'calendar-title', text: `${months[month]} ${year}` }),
                el('button', { class: 'calendar-nav-btn', data: { action: 'next-month' }, text: '▶' })
            ]));
            
            // Weekdays
            container.appendChild(el('div', { class: 'calendar-weekdays' },
                ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => el('div', { class: 'calendar-weekday', text: d }))
            ));
            
            // Grid
            const grid = el('div', { class: 'calendar-grid' });
            
            // Empty cells
            for (let i = 0; i < firstDay; i++) grid.appendChild(el('div', { class: 'calendar-day empty' }));
            
            // Days
            for (let day = 1; day <= daysInMonth; day++) {
                const isToday = isCurrentMonth && day === today.getDate();
                const dayTasks = tasksByDay[day] || [];
                
                const dayCell = el('div', { class: `calendar-day ${isToday ? 'today' : ''}` }, [
                    el('div', { class: 'calendar-day-number', text: day })
                ]);
                
                if (dayTasks.length) {
                    const tasksDiv = el('div', { class: 'calendar-day-tasks' });
                    
                    dayTasks.slice(0, 2).forEach(task => {
                        const taskEl = el('div', {
                            class: 'calendar-task',
                            data: { taskId: task.id },
                            style: { cursor: 'pointer' }
                        }, [
                            el('div', { class: `calendar-task-color ${task.completed ? 'completed' : ''}` }),
                            el('div', { class: 'calendar-task-title', text: task.title })
                        ]);
                        taskEl._taskData = task;
                        tasksDiv.appendChild(taskEl);
                    });
                    
                    if (dayTasks.length > 2) {
                        tasksDiv.appendChild(el('div', { class: 'calendar-task-more', text: `+${dayTasks.length - 2} more` }));
                    }
                    
                    dayCell.appendChild(tasksDiv);
                }
                
                grid.appendChild(dayCell);
            }
            
            container.appendChild(grid);
        });
    };
    
    const renderStats = () => {
        api.get('stats').done(stats => {
            // jQuery text update
            $j('#totalTasks').text(stats.total);
            $j('#completedCount').text(stats.completed);
            
            // Vanilla JS animation
            ['totalTasks', 'completedCount'].forEach(id => {
                const el = $(`#${id}`);
                const target = id === 'totalTasks' ? stats.total : stats.completed;
                if (!el) return;
                
                const start = performance.now();
                const animate = now => {
                    const progress = Math.min((now - start) / 500, 1);
                    el.textContent = Math.floor(target * progress * (2 - progress));
                    if (progress < 1) requestAnimationFrame(animate);
                };
                requestAnimationFrame(animate);
            });
        });
    };
    
    const renderAll = () => { renderTasks(); renderQuickTodos(); renderCalendar(); renderStats(); };
    
    // ============ MODAL ============
    let escapeHandler = null; 

    const showModal = taskOrId => {
        const show = task => {
            $$('.task-modal-overlay').forEach(m => m.remove());
            
            const overlay = el('div', { class: 'task-modal-overlay', id: 'taskModalOverlay' }, [
                el('div', {
                    class: 'task-modal',
                    role: 'dialog',
                    'aria-modal': 'true',
                    tabindex: '-1'
                }, [
                    el('div', { class: 'task-modal-header' }, [
                        el('h3', { text: task.title }),
                        el('button', {
                            class: 'task-modal-close',
                            html: '&times;',
                            events: { click: () => closeModal(overlay) }
                        })
                    ]),
                    el('div', { class: 'task-modal-body' }, [
                        task.description && el('p', { class: 'task-modal-desc', text: task.description }),
                        task.deadline && el('p', {
                            class: 'task-modal-date',
                            html: `📅 ${formatDate(task.deadline)}${!task.completed && new Date(task.deadline) < new Date() ? ' <span class="overdue-badge">(Overdue)</span>' : ''}`,
                            style: !task.completed && new Date(task.deadline) < new Date() ? { color: '#ef4444' } : {}
                        }),
                        el('span', { class: `status-badge ${task.completed ? 'completed' : 'pending'}`, text: task.completed ? 'Completed' : 'Pending' })
                    ].filter(Boolean)),
                    el('div', { class: 'task-modal-actions' }, [
                        el('button', {
                            class: 'modal-btn toggle-btn',
                            text: task.completed ? 'Mark Incomplete' : 'Mark Complete',
                            events: {
                                click: function() {
                                    this.disabled = true;
                                    this.textContent = 'Updating...';
                                    api.patch('task', task.id)
                                        .done(() => { closeModal(overlay); renderAll(); notify('Task status updated!'); })
                                        .fail(() => { this.disabled = false; this.textContent = task.completed ? 'Mark Incomplete' : 'Mark Complete'; });
                                }
                            }
                        }),
                        el('button', {
                            class: 'modal-btn edit-btn',
                            text: 'Edit',
                            events: { click: () => { closeModal(overlay); openForm(task); } }
                        }),
                        el('button', {
                            class: 'modal-btn delete-btn',
                            text: 'Delete',
                            events: {
                                click: function() {
                                    if (!confirm('Delete this task?')) return;
                                    this.disabled = true;
                                    this.textContent = 'Deleting...';
                                    api.delete('task', task.id)
                                        .done(() => { closeModal(overlay); renderAll(); notify('Task deleted!'); });
                                }
                            }
                        })
                    ])
                ])
            ]);
            
            // Click outside to close
            overlay.addEventListener('click', e => e.target === overlay && closeModal(overlay));
            
            // Escape key
            if (escapeHandler) document.removeEventListener('keydown', escapeHandler);
            escapeHandler = e => e.key === 'Escape' && closeModal(overlay);
            document.addEventListener('keydown', escapeHandler);
            
            document.body.appendChild(overlay);
            requestAnimationFrame(() => overlay.classList.add('visible'));
        };
        
        if (typeof taskOrId === 'object') return show(taskOrId);
        
        const task = findTask(state.tasks, taskOrId);
        if (task) return show(task);
        
        api.get('tasks').done(tasks => {
            state.tasks = tasks;
            const t = findTask(tasks, taskOrId);
            t ? show(t) : notify('Task not found', 'error');
        });
    };
    
    const closeModal = overlay => {
        overlay = overlay || $('#taskModalOverlay');
        if (!overlay) return;
        overlay.classList.remove('visible');
        if (escapeHandler) { document.removeEventListener('keydown', escapeHandler); escapeHandler = null; }
        setTimeout(() => overlay.remove(), 300);
    };
    
    // ============ EVENT DELEGATION ============

    // jQuery delegation for task cards
    $j(document).on('click', '.task-card [data-action]', function(e) {
        e.stopPropagation();
        const action = $j(this).data('action');
        const id = $j(this).closest('.task-card').data('id');
        
        if (action === 'toggle') toggleTask(id);
        else if (action === 'edit') api.get('tasks').done(tasks => { state.tasks = tasks; openForm(findTask(tasks, id)); });
        else if (action === 'delete') deleteTask(id);
    });
    
    // Vanilla JS delegation for todos
    document.addEventListener('click', e => {
        const action = e.target.dataset?.action;
        const item = e.target.closest('.task-item');
        if (!action || !item) return;
        
        const id = item.dataset.id;
        if (action === 'edit-todo') {
            const todo = findTask(state.todos, id);
            if (todo) {
                const text = prompt('Edit task:', todo.text);
                if (text?.trim()) api.put('todo', id, { text: text.trim() }).done(() => { renderQuickTodos(); notify('Todo updated!'); });
            }
        } else if (action === 'delete-todo') {
            if (confirm('Delete this task?')) {
                item.style.opacity = '0.5';
                api.delete('todo', id).done(() => { renderQuickTodos(); notify('Todo deleted!'); });
            }
        }
    });
    
    document.addEventListener('change', e => {
        if (e.target.dataset?.action === 'toggle-todo') {
            const item = e.target.closest('.task-item');
            if (item) api.patch('todo', item.dataset.id).done(renderQuickTodos);
        }
    });
    
    // Calendar navigation - jQuery
    $j(document).on('click', '[data-action="prev-month"]', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() - 1); renderCalendar(); });
    $j(document).on('click', '[data-action="next-month"]', () => { state.calendarDate.setMonth(state.calendarDate.getMonth() + 1); renderCalendar(); });
    
    // Calendar task click - Vanilla JS
    document.addEventListener('click', e => {
        const task = e.target.closest('.calendar-task');
        if (task) {
            e.preventDefault();
            e.stopPropagation();
            task._taskData ? showModal(task._taskData) : showModal(task.dataset.taskId);
        }
    });
    
    // Quick todo add button
    $('#newQuickTodoBtn')?.addEventListener('click', () => {
        const text = prompt('New task:');
        if (text?.trim()) api.post('todos', { text: text.trim() }).done(() => { renderQuickTodos(); notify('Todo added!'); });
    });
    
    // ============ INIT ============ 
    renderAll();
});