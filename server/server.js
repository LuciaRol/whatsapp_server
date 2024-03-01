const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fileUpload = require('express-fileupload');
const path = require('path');
const { spawn } = require('child_process'); // Import spawn from child_process module
const cors = require('cors'); // Import cors middleware

const app = express();
const server = http.createServer(app);

if (process.env.NODE_ENV !== 'production') {
    const cors = require('cors');
    app.use(cors({ origin: "http://localhost:3000" }));
}

// Use cors 
app.use(cors());

// Define an array to store connected users' information
const connectedUsers = [];

// Middleware for file uploads
app.use(fileUpload());

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const io = socketIo(server, {
    cors: process.env.NODE_ENV === 'production' ? "https://whatsapp-clon-1.vercel.app" : {
        origin: "http://localhost:3000"
    },
    reconnectionAttempts: 3, // Limit the number of reconnection attempts
    reconnectionDelay: 1000, // Initial delay before attempting to reconnect (in milliseconds)
    reconnectionDelayMax: 5000 // Maximum delay between reconnection attempts (in milliseconds)
});


// Socket.io event handling
io.on('connection', (socket) => {
    console.log('New client connected');
    
    // Increment connected user count and log
    console.log('Usuarios conectados:', connectedUsers.length + 1);

    // Handling user registration
    socket.on('register', ({ username, profilePicture, status }) => {
        console.log('Received registration data:', username, profilePicture, status);

        // Save user information // se ha añadido el nick: para que sea un json valido
        connectedUsers.push({ id: socket.id, username, profilePicture, status });
        console.log('User registered:', username);
        console.log('Connected users:', connectedUsers);

        // Emit updated list of connected users to all clients
        io.emit('connectedUsersUpdate', connectedUsers.map(user => user.username));

        // Emit socket ID back to client for future reference
        socket.emit('registrationSuccess', socket.id);
    });

     // Handling incoming messages
     socket.on('message', (data) => {
        console.log('Message received:', data);
        // Broadcast the message to all connected clients
        socket.broadcast.emit('message', data);
    });

    socket.on('typing', (username) => {
        // Emitir mensaje de que el usuario está escribiendo a todos los clientes excepto al que está escribiendo
        socket.broadcast.emit('typing', username);
    });
    

    // Handling disconnection
    socket.on('disconnect', () => {
        console.log('Client disconnected');
        // Remove the disconnected user from the array
        const index = connectedUsers.findIndex(user => user.id === socket.id);
        if (index !== -1) {
            connectedUsers.splice(index, 1);
            // Emit updated list of connected users to all clients
            io.emit('connectedUsersUpdate', connectedUsers.map(user => user.username));
        }
        // Decrement connected user count and log
        console.log('Total connected users:', connectedUsers.length);
    });

    // Handle user status update
    socket.on('updateStatus', (status) => {
        const user = connectedUsers.find(u => u.id === socket.id);
        if (user) {
            user.status = status;
            console.log('User status updated:', status);
        }
    });

    // rooms: agrupa los sockets
  socket.on('entrarChat', (chat)=>{
    socket.join(chat);
    io.to(chat).emit('connectToRoom', 'Bienvenido a la sala');
  });

  socket.on('mensajeEnSala', (datos)=>{
    datos = {
      sala: "nombreSala",
      nick: "miNick",
      msg: "mensaje"
    }
    socket.to(datos.sala).emit("mensajeEnSala", datos)
  });

    
});

// Handle user registration endpoint
app.post('/register', (req, res) => {
    const { username } = req.body;
    const { profilePicture } = req.files;

    // Save profile picture to uploads folder
    if (profilePicture) {
        const fileName = `${Date.now()}-${profilePicture.name}`;
        profilePicture.mv(path.join(__dirname, 'uploads', fileName), (err) => {
            if (err) {
                console.error('Error saving profile picture:', err);
                res.status(500).send('Error saving profile picture');
            } else {
                // Construct the imageUrl dynamically using the baseUrl received from the client

                const serverUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : 'https://whatsapp-clon-1.vercel.app/';
                const imageUrl = `${serverUrl}/uploads/${fileName}`;
                // Send the URL of the uploaded image to the client along with the username
                io.to(req.socketId).emit('registrationComplete', { username, profilePicture: imageUrl });
                // Store user information on the server
                connectedUsers.push({ id: req.socketId, username, profilePicture: imageUrl, status: 'online' });
                res.json({ username, profilePicture: imageUrl });
            }
        });
    } else {
        // If no profile picture was uploaded, send only the username
        // Send user registration data to the client
        io.to(req.socketId).emit('registrationComplete', { username });
        // Store user information on the server
        connectedUsers.push({ id: req.socketId, username, status: 'online' });
        res.json({ username });
    }
});

// Handle user status update endpoint
app.post('/updateStatus', (req, res) => {
    const { socketId, status } = req.body;
    // Update user status
    const user = connectedUsers.find(u => u.id === socketId);
    if (user) {
        user.status = status;
        res.json({ status: 'updated' });
    } else {
        res.status(404).send('User not found');
    }
});

// Handle request for connected users
app.get('/connectedUsers', (req, res) => {
    res.json(connectedUsers.map(user => user.username));
});

// Start the server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Automatically start the React development server
    //const reactServer = spawn('npm', ['start'], { stdio: 'inherit', shell: true });

    //reactServer.on('close', (code) => {
    //    console.log(`React server exited with code ${code}`);
        // You can handle server close event here if needed
    //});
});
