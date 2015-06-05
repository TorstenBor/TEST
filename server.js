// Startup Express App
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
http.listen(process.env.PORT || 3000);

// rooms which are currently available in chat
var GLOBAL_ROOM = 'Global';
var MAX_MESSAGES = 100;
var users = {'Global': []};

// Configure Redis client connection
var redis = require('redis');
var credentials;
// Check if we are in BlueMix or localhost
if(process.env.VCAP_SERVICES) {
  // On BlueMix read connection settings from
  // VCAP_SERVICES environment variable
  var env = JSON.parse(process.env.VCAP_SERVICES);
  credentials = env['redis-2.6'][0]['credentials'];
} else {
  // On localhost just hardcode the connection details
  credentials = { "host": "127.0.0.1", "port": 6379 }
}
// Connect to Redis
var redisClient;

var connectToRedis = function() {
  redisClient = redis.createClient(credentials.port, credentials.host);
  if('password' in credentials) {
    // On BlueMix we need to authenticate against Redis
    redisClient.auth(credentials.password);
  }
};
connectToRedis();

// There's an issue with the Redis client for Node where it
// will time out every so often and hang the client browser
// This code gets around this issue by reconnecting on timeout
var refreshRedis = function() {
  var replaceClient = function() {
    redisClient.closing = true;
    redisClient.end();

    connectToRedis();
    refreshRedis();
  };

  redisClient.once("end", function() {
    replaceClient();
  });
};
refreshRedis();

var getMessages = function(room, callback) {
  // Get the 100 most recent messages from Redis
  var messages = redisClient.lrange('messages_' + room, 0, MAX_MESSAGES - 1, function(err, reply) {
    if(!err) {
      var result = [];
      // Loop through the list, parsing each item into an object
      for(var msg in reply) result.push(JSON.parse(reply[msg]));
        callback(result.reverse());
    } else throw err;
  });
};

// Configure Jade template engine
var path = require('path');
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.static(path.join(__dirname, 'public')));

// handle HTTP GET request to the "/" URL
app.get('/', function(req, res) {

  // Get the 100 most recent messages from Redis
  var messages = redisClient.lrange('messages_' + GLOBAL_ROOM, 0, MAX_MESSAGES - 1, function(err, reply) {
    if(!err) {
      var result = [];
      // Loop through the list, parsing each item into an object
      for(var msg in reply) result.push(JSON.parse(reply[msg]));
      // Pass the message list to the view
      res.render('index', { messages: result.reverse(), users: users[GLOBAL_ROOM] });
    } else res.render('index');
  });

});

// socket.io listen for messages
io.on('connection', function(socket) {  
  // When a message is received, broadcast it

  // to all users except the originating client
  socket.on('msg', function(data) {
    redisClient.lpush('messages_' + socket.room, JSON.stringify(data));
    redisClient.ltrim('messages_' + socket.room, 0, MAX_MESSAGES - 1);
    io.sockets.in(socket.room).emit('msg', data);
  });

  // When a user joins the chat, send a notice
  // to all users except the originating client
  socket.on('join', function(nickname) {
    // Attach the user's nickname to the socket
    socket.nickname = nickname;
    // Set current room to global and store it
    socket.room = GLOBAL_ROOM;
    // join global room
    socket.join(socket.room);

    if ( users[GLOBAL_ROOM].indexOf(nickname) == -1 ) users[GLOBAL_ROOM].push(nickname);

    socket.emit('updaterooms', users[GLOBAL_ROOM], socket.room);
    //socket.emit('loadmessages', getMessages(socket.room));

    // notification for user that just connected
    socket.emit('notice', 'You joined the room \'' + socket.room + '\'!');
    // broadcast to group channel that new user connected
    socket.broadcast.to(socket.room).emit('notice', socket.nickname + ' has joined the room \'' + socket.room + '\'.');
    socket.broadcast.to(socket.room).emit('updaterooms', users[socket.room], socket.room);
  });

    socket.on('switchRoom', function(newroom){
      // leave the current room (stored in session)
      socket.leave(socket.room);
      // join new room, received as function parameter
      socket.join(newroom);

      if ( users[newroom] == undefined ) users[newroom] = [];
      if ( users[newroom].indexOf(socket.nickname) == -1 ) users[newroom].push(socket.nickname);
      if ( users[socket.room].indexOf(socket.nickname) != -1 ) users[socket.room].splice(users[socket.room].indexOf(socket.nickname), 1);

      socket.emit('updaterooms', users[newroom], newroom);

      getMessages(newroom, function(room_messages){
          socket.emit('loadmessages', room_messages, 'You joined the room \'' + socket.room + '\'!');
      });

          //socket.emit('notice', 'You joined the room \'' + socket.room + '\'!');
      // sent message to OLD room
      socket.broadcast.to(socket.room).emit('notice', socket.nickname + ' has left the room \'' + socket.room + '\'.');
      socket.broadcast.to(socket.room).emit('updaterooms', users[socket.room], socket.room);

      socket.broadcast.to(newroom).emit('notice', socket.nickname + ' has joined the room \'' + newroom + '\'.');
      socket.broadcast.to(newroom).emit('updaterooms', users[newroom], newroom);
          // update socket session room title
          socket.room = newroom;
	});

  // When a user disconnects, send a notice
  // to all users except the originating client
  socket.on('disconnect', function() {
    if ( users[socket.room] != undefined && users[socket.room].indexOf(socket.nickname) != -1 ) users[socket.room].splice(users[socket.room].indexOf(socket.nickname), 1);
    socket.broadcast.to(socket.room).emit('updaterooms', users[socket.room], socket.room);

    socket.broadcast.emit('notice', socket.nickname + ' has left the chat.');
    //leave current room
    socket.leave(socket.room);
  });
});