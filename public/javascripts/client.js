$(document).ready(function() {
  var socket = io(), nickname, msgList = $('#messages'), userList = $('#user_list'), x = $('#location'), mapholder = $('#mapholder');


  function getLocation() {
      if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(showPosition);
      } else {
          x.text("Geolocation is not supported by this browser.");
      }
  }
//$('#location').text("whut?")
  function showPosition(position) {
      lat = position.coords.latitude;
      lon = position.coords.longitude;

      var locs;
      $.getJSON("http://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + lon + "&sensor=true", function(json){
          socket.emit('switchRoom', json.results[0].address_components[3].long_name);;
      });

      latlon = new google.maps.LatLng(lat, lon)

      var myOptions = {
        center:latlon,zoom:14,
        mapTypeId:google.maps.MapTypeId.ROADMAP,
        mapTypeControl:false,
        navigationControlOptions:{style:google.maps.NavigationControlStyle.SMALL}
      }

      var map = new google.maps.Map(document.getElementById("mapholder"), myOptions);
      var marker = new google.maps.Marker({position:latlon,map:map,title:"You are here!"});
  }

  function showError(error) {
      switch(error.code) {
          case error.PERMISSION_DENIED:
              x.text("User denied the request for Geolocation.");
              break;
          case error.POSITION_UNAVAILABLE:
              x.text("Location information is unavailable.");
              break;
          case error.TIMEOUT:
              x.text("The request to get user location timed out.");
              break;
          case error.UNKNOWN_ERROR:
              x.text("An unknown error occurred.");
              break;
      }
  }

  getLocation();

  // Check if nickname stored in localStorage
  if('localStorage' in window && localStorage.getItem('nickname')) {
    nickname = localStorage.getItem('nickname');
  } else {
    // If not in localStorage, prompt user for nickname
    nickname = prompt('Please enter your nickname');
    if('localStorage' in window) {
      localStorage.setItem('nickname', nickname);
    }
  }  

  // Send message to server that user has joined
  socket.emit('join', nickname);

  // Function to add a message to the page
  var newMessage = function(data) {
    var who = $('<div class="who">').text(data.nickname),
        when = $('<div class="when">').text(data.when),
        msg = $('<div class="msg">').text(data.msg),
        header = $('<div class="header clearfix">').append(who).append(when),
        li = $('<li>').append(header).append(msg);    

    msgList.append(li);
    msgList.scrollTop(msgList[0].scrollHeight);
  };

  // Handle the form to submit a new message
  $('#msg_form').submit(function(e) {
    var msgField = $('#msg'),
        data = { msg: msgField.val(), nickname: nickname, when: new Date().toString().substr(0, 24) };
    e.preventDefault();
    // Send message to Socket.io server
    socket.emit('msg', data);
    // Add message to the page
    //newMessage(data);
    // Clear the message field
    msgField.val('');    
  });

  // Handle the form to submit a room name
  $('#room_form').submit(function(e) {
    var roomField = $('#chg_room');
    e.preventDefault();
    // Send message to Socket.io server
    socket.emit('switchRoom', roomField.val());
    // Add message to the page
    //newMessage(data);
    // Clear the message field
    roomField.val('');
  });

  // When a message is received from the server
  // add it to the page using newMessage()
  socket.on('msg', function(data) { newMessage(data); });

  // When a notice is received from the server
  // (user joins or disconnects), add it to the page
  socket.on('notice', function(msg) {
    msgList.append($('<div class="notice">').text(msg));
  });

  socket.on('updaterooms', function(users, current_room) {
  		$('#current_room').empty();
  		$('#current_room').append(current_room);

  		userList.empty();
  		if(users != null){
          $.each(users, function(idx, user) {
              var who = $('<div class="who">').text(user),
                  usr = $('<div class="user clearfix">').append(who),
                  li = $('<li>').append(usr);
                  userList.append(li);
              });
      }
/*  		$.each(rooms, function(key, value) {
  			if(value == current_room){
  				$('#current_room').append(value);
  			}
  			else {
  				//$('#room').append('<div><a href="#" onclick="switchRoom(\''+value+'\');return false;">' + value + '</a></div>');
  			}
  		});

  		$("#current_room").off("click");
  		if(current_room == "Global") {$('#current_room').click(function(){ switchRoom('Privat'); }); };
  		if(current_room == "Privat") {$('#current_room').click(function(){ switchRoom('Global'); }); };*/
  	});

/*  function switchRoom(room){
    socket.emit('switchRoom', room);
  }*/

  socket.on('loadmessages', function(messages, msg){
    msgList.empty();
    if(messages != null){
        $.each(messages, function(idx, message) {
            newMessage(message);
            });
    }
    msgList.append($('<div class="notice">').text(msg));
    msgList.scrollTop(msgList[0].scrollHeight);
    });

});