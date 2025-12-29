<?php
/**
 * Task Manager API
 * Dual Storage: SQLite + JSON (synchronized)
 * Clean version - no category, no priority
 */

// ============ HEADERS ============

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// ============ CONFIGURATION ============

define('DATA_DIR', dirname(__DIR__) . '/data/');
define('DB_FILE', DATA_DIR . 'database.db');
define('TASKS_JSON', DATA_DIR . 'tasks.json');
define('TODOS_JSON', DATA_DIR . 'todos.json');
define('SETTINGS_JSON', DATA_DIR . 'settings.json');

// Create data directory
if (!file_exists(DATA_DIR)) {
    mkdir(DATA_DIR, 0755, true);
}

// ============ DATABASE CONNECTION ============

try {
    $db = new PDO("sqlite:" . DB_FILE);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}

// ============ CREATE TABLES (Clean - no category/priority) ============

$db->exec("
    CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        deadline TEXT,
        completed INTEGER DEFAULT 0,
        created_at TEXT,
        updated_at TEXT
    )
");

$db->exec("
    CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        created_at TEXT
    )
");

// ============ JSON FUNCTIONS ============

function readJSON($file) {
    if (!file_exists($file)) {
        return [];
    }
    $content = file_get_contents($file);
    return json_decode($content, true) ?? [];
}

function writeJSON($file, $data) {
    return file_put_contents(
        $file,
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

// ============ SYNC FUNCTIONS ============

function syncTasksToJSON($db) {
    $stmt = $db->query("SELECT id, title, description, deadline, completed, created_at, updated_at FROM tasks ORDER BY created_at DESC");
    $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($tasks as &$task) {
        $task['completed'] = (bool)$task['completed'];
    }
    
    writeJSON(TASKS_JSON, $tasks);
    return $tasks;
}

function syncTodosToJSON($db) {
    $stmt = $db->query("SELECT id, text, completed, created_at FROM todos ORDER BY id ASC");
    $todos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($todos as &$todo) {
        $todo['id'] = (int)$todo['id'];
        $todo['completed'] = (bool)$todo['completed'];
    }
    
    writeJSON(TODOS_JSON, $todos);
    return $todos;
}

// ============ HELPERS ============

function sanitize($input) {
    if ($input === null) return null;
    return htmlspecialchars(trim($input), ENT_QUOTES, 'UTF-8');
}

function generateId($prefix = 'item') {
    return $prefix . '_' . time() . '_' . bin2hex(random_bytes(8));
}

// ============ GET REQUEST INFO ============

$action = $_GET['action'] ?? '';
$id = isset($_GET['id']) ? sanitize($_GET['id']) : null;
$method = $_SERVER['REQUEST_METHOD'];

$input = [];
$rawInput = file_get_contents('php://input');
if (!empty($rawInput)) {
    $input = json_decode($rawInput, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON']);
        exit;
    }
}

// ============ HANDLE REQUESTS ============

try {
    switch ($action) {
        
        // ===== TASKS =====
        
        case 'tasks':
            if ($method === 'GET') {
                $stmt = $db->query("SELECT id, title, description, deadline, completed, created_at, updated_at FROM tasks ORDER BY created_at DESC");
                $tasks = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                foreach ($tasks as &$task) {
                    $task['completed'] = (bool)$task['completed'];
                }
                
                echo json_encode($tasks);
            }
            elseif ($method === 'POST') {
                if (empty($input['title'])) {
                    throw new Exception('Title is required');
                }
                
                $id = generateId('task');
                
                // 1. Insert into SQLite
                $stmt = $db->prepare("
                    INSERT INTO tasks (id, title, description, deadline, completed, created_at)
                    VALUES (?, ?, ?, ?, 0, ?)
                ");
                $stmt->execute([
                    $id,
                    sanitize($input['title']),
                    sanitize($input['description'] ?? null),
                    $input['deadline'] ?? null,
                    date('c')
                ]);
                
                // 2. Sync to JSON
                syncTasksToJSON($db);
                
                echo json_encode(['id' => $id, 'success' => true]);
            }
            break;
            
        case 'task':
            if (!$id) throw new Exception('Task ID is required');
            
            if ($method === 'GET') {
                $stmt = $db->prepare("SELECT id, title, description, deadline, completed, created_at, updated_at FROM tasks WHERE id = ?");
                $stmt->execute([$id]);
                $task = $stmt->fetch(PDO::FETCH_ASSOC);
                
                if ($task) {
                    $task['completed'] = (bool)$task['completed'];
                    echo json_encode($task);
                } else {
                    http_response_code(404);
                    echo json_encode(['error' => 'Task not found']);
                }
            }
            elseif ($method === 'PUT') {
                if (empty($input['title'])) {
                    throw new Exception('Title is required');
                }
                
                // 1. Update SQLite
                $stmt = $db->prepare("
                    UPDATE tasks 
                    SET title = ?, description = ?, deadline = ?, updated_at = ?
                    WHERE id = ?
                ");
                $stmt->execute([
                    sanitize($input['title']),
                    sanitize($input['description'] ?? null),
                    $input['deadline'] ?? null,
                    date('c'),
                    $id
                ]);
                
                // 2. Sync to JSON
                syncTasksToJSON($db);
                
                echo json_encode(['success' => true]);
            }
            elseif ($method === 'DELETE') {
                // 1. Delete from SQLite
                $stmt = $db->prepare("DELETE FROM tasks WHERE id = ?");
                $stmt->execute([$id]);
                
                // 2. Sync to JSON
                syncTasksToJSON($db);
                
                echo json_encode(['success' => true]);
            }
            elseif ($method === 'PATCH') {
                // 1. Toggle in SQLite
                $stmt = $db->prepare("UPDATE tasks SET completed = NOT completed, updated_at = ? WHERE id = ?");
                $stmt->execute([date('c'), $id]);
                
                // 2. Sync to JSON
                syncTasksToJSON($db);
                
                echo json_encode(['success' => true]);
            }
            break;
            
        // ===== TODOS =====
        
        case 'todos':
            if ($method === 'GET') {
                $stmt = $db->query("SELECT id, text, completed, created_at FROM todos ORDER BY id ASC");
                $todos = $stmt->fetchAll(PDO::FETCH_ASSOC);
                
                foreach ($todos as &$todo) {
                    $todo['id'] = (int)$todo['id'];
                    $todo['completed'] = (bool)$todo['completed'];
                }
                
                echo json_encode($todos);
            }
            elseif ($method === 'POST') {
                if (empty($input['text'])) {
                    throw new Exception('Text is required');
                }
                
                // 1. Insert into SQLite
                $stmt = $db->prepare("INSERT INTO todos (text, completed, created_at) VALUES (?, 0, ?)");
                $stmt->execute([sanitize($input['text']), date('c')]);
                $newId = (int)$db->lastInsertId();
                
                // 2. Sync to JSON
                syncTodosToJSON($db);
                
                echo json_encode(['id' => $newId, 'success' => true]);
            }
            break;
            
        case 'todo':
            if (!$id) throw new Exception('Todo ID is required');
            
            if ($method === 'PUT') {
                if (empty($input['text'])) {
                    throw new Exception('Text is required');
                }
                
                // 1. Update SQLite
                $stmt = $db->prepare("UPDATE todos SET text = ? WHERE id = ?");
                $stmt->execute([sanitize($input['text']), $id]);
                
                // 2. Sync to JSON
                syncTodosToJSON($db);
                
                echo json_encode(['success' => true]);
            }
            elseif ($method === 'DELETE') {
                // 1. Delete from SQLite
                $stmt = $db->prepare("DELETE FROM todos WHERE id = ?");
                $stmt->execute([$id]);
                
                // 2. Sync to JSON
                syncTodosToJSON($db);
                
                echo json_encode(['success' => true]);
            }
            elseif ($method === 'PATCH') {
                // 1. Toggle in SQLite
                $stmt = $db->prepare("UPDATE todos SET completed = NOT completed WHERE id = ?");
                $stmt->execute([$id]);
                
                // 2. Sync to JSON
                syncTodosToJSON($db);
                
                echo json_encode(['success' => true]);
            }
            break;
            
        // ===== STATS =====
        
        case 'stats':
            $total = $db->query("SELECT COUNT(*) FROM tasks")->fetchColumn();
            $completed = $db->query("SELECT COUNT(*) FROM tasks WHERE completed = 1")->fetchColumn();
            
            echo json_encode([
                'total' => (int)$total,
                'completed' => (int)$completed
            ]);
            break;
            
        // ===== SETTINGS =====
        
        case 'settings':
            if ($method === 'GET') {
                $settings = readJSON(SETTINGS_JSON);
                if (empty($settings)) {
                    $settings = [
                        'theme' => 'light',
                        'showCompleted' => true
                    ];
                }
                echo json_encode($settings);
            }
            elseif ($method === 'PUT') {
                $current = readJSON(SETTINGS_JSON);
                $updated = array_merge($current, $input);
                $updated['updatedAt'] = date('c');
                writeJSON(SETTINGS_JSON, $updated);
                echo json_encode(['success' => true]);
            }
            break;
            
        // ===== SYNC =====
        
        case 'sync':
            if ($method === 'GET') {
                $sqliteTasks = $db->query("SELECT COUNT(*) FROM tasks")->fetchColumn();
                $sqliteTodos = $db->query("SELECT COUNT(*) FROM todos")->fetchColumn();
                $jsonTasks = count(readJSON(TASKS_JSON));
                $jsonTodos = count(readJSON(TODOS_JSON));
                
                echo json_encode([
                    'sqlite' => ['tasks' => (int)$sqliteTasks, 'todos' => (int)$sqliteTodos],
                    'json' => ['tasks' => $jsonTasks, 'todos' => $jsonTodos],
                    'inSync' => ($sqliteTasks == $jsonTasks && $sqliteTodos == $jsonTodos)
                ]);
            }
            elseif ($method === 'POST') {
                $tasks = syncTasksToJSON($db);
                $todos = syncTodosToJSON($db);
                
                echo json_encode([
                    'success' => true,
                    'synced' => ['tasks' => count($tasks), 'todos' => count($todos)]
                ]);
            }
            break;
            
        default:
            http_response_code(404);
            echo json_encode(['error' => 'Endpoint not found']);
    }
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>