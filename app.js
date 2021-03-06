var express = require('express');
var app = require('express')();
var fs = require('fs');
var HTTPS_OPTIONS = {
    ca: fs.readFileSync( 'ssl/https/sub.class1.server.sha2.ca.pem' ),
    key: fs.readFileSync( 'ssl/https/mumbleexpress.key' ),
    cert: fs.readFileSync( 'ssl/https/mumbleexpress.crt' )
};
var MUMBLE_OPTIONS = {
    key: fs.readFileSync( 'ssl/mumble/private.key' ),
    cert: fs.readFileSync( 'ssl/mumble/cert.crt' )
};
var https = require('https').createServer(HTTPS_OPTIONS,app);
var http = require('http').createServer(app);
var io = require('socket.io')(https);
var mumble = require('mumble');

function User(socket) {

    var socket = socket.id;

    var mumbleClient = null;

    //store the state of users connected to mumble server
    var sessions = {}

    var _isInitialized = false;

    var _inputStream = null;

    var _clientSampleRate = 0;

    this.isInitialized = function() {
	return _isInitialized;
    };

    this.getInputStream = function() {
	return _inputStream;
    };

    this.getSampleRate = function() {
	return _clientSampleRate;
    };

    this.setSampleRate = function(sampleRate) {
	_clientSampleRate = sampleRate;
    };

    var onInit = function() {
	_inputStream = mumbleClient.inputStream({sampleRate: _clientSampleRate, channels: 1, gain: 1});
	_isInitialized = true;
	// Connection is authenticated and usable.
    };

    var onVoice = function(data) {
	io.sockets.connected[socket].emit("voiceMessage", data);
    };

    var onText = function(data) {
	var channel = data.channel_id[0] != null ? true : false;
	var tree = data.tree_id[0] != null ? true: false;
	var textMessage = {
	    "userName": sessions[data.actor].name,
	    "message": data.message,
	    "channel": channel,
	    "tree": tree
	}
	io.sockets.connected[socket].emit("textMessage",textMessage);
    };

    var onUserState = function(state) {
	if(!(state.session in sessions)) //new user connection
	    sessions[state.session] = state;
	io.sockets.connected[socket].emit("userState",state);
    };

    var onUserRemove = function(state) {
	delete sessions[state.session];
	io.sockets.connected[socket].emit("userRemove",state);
    };

    var onChannelState = function(state) {
	io.sockets.connected[socket].emit("channelState",state);
    };

    var onChannelRemove = function (state) {
	io.sockets.connected[socket].emit("channelRemove",state);
    };

    var onMumbleConnectionError = function (err) {
	io.sockets.connected[socket].emit("errorMessage",err.reason);

	// If the mumble connection gets an error for any reason,
	// close the connection and prompt the user to reenter the
	// server info.
	this.disconnect();
	io.sockets.connected[socket].emit("tryReconnect");
    };

    this.getMumbleConnection = function() {
	return mumbleClient;
    };

    this.doConnect = function(serverAddress, username, password, mute, deaf, key, cert) {
	// TODO: if key and cert are not undefined, make a custom options object for this user
	mumble.connect( serverAddress, MUMBLE_OPTIONS, function ( error, client ) {
	    try {
		mumbleClient = client;
		if( error ) {
		    io.sockets.connected[socket].emit("errorMessage","Could not connect");
		    throw new Error( error );
		}

		client.authenticate( username );

		client.on('initialized', onInit );
		client.on('voice', onVoice );
		client.on('textMessage', onText );
		client.on('userState', onUserState);
		client.on('userRemove', onUserRemove);
		client.on('channelState', onChannelState);
		client.on('channelRemove', onChannelRemove);
		client.on('error', onMumbleConnectionError);
		client.on('ready', function() {
		    if(deaf)
			client.user.setSelfDeaf(deaf);
		    else if(mute)
			client.user.setSelfMute(mute);
		    io.sockets.connected[socket].emit("ready");
		});
	    }
	    catch(e) {
		if(io.sockets.connected[socket])
		    io.sockets.connected[socket].disconnect('fail');
	    }
	});
    };

    this.disconnect = function() {
	if(mumbleClient) {
	    _inputStream.close();
	    mumbleClient.disconnect();
	}
	_isInitialized = false;
    }
}

io.on('connection', function(socket){
    var user = new User(socket);

    socket.on('login', function(loginInfo) {
	if(loginInfo.userName == '') {
	    socket.emit("errorMessage","Invalid username");
	    return;
	}
	var password = loginInfo.password == '' ? null : loginInfo.password;
	var serverAddress = 'mumble://'+loginInfo.ip+':'+loginInfo.port;
	user.doConnect(serverAddress, loginInfo.userName, loginInfo.password, loginInfo.muted, loginInfo.deafened);
    });

    socket.on('send msg', function(message) {
	if(!user.getMumbleConnection() || !user.getMumbleConnection().users())
	    return;
	var textMessage = message.message;
	var clientRecipient = message.recipient;

	if(textMessage == '')
	    return;
	
	var serverRecipients = { session: [], channel_id: [] };

	var clients = user.getMumbleConnection().users();
        for( var c in clients ) {
            var client = clients[c];

	    if(clientRecipient.isChannel) {
		if(clientRecipient.id == client.channel.id) {
		    serverRecipients.session.push( client.session );
		    serverRecipients.channel_id.push( client.channel.id );
		}
            }
	    else if(clientRecipient.id == client.session) {
		serverRecipients.session.push( client.session );
		serverRecipients.channel_id.push( client.channel.id );
	    }
	}

	user.getMumbleConnection().sendMessage(textMessage, serverRecipients);
    });

    socket.on('disconnect', function() {
	user.disconnect();
    });

    socket.on('change channels', function(channelSwitch) {
	if(channelSwitch.isChannel) {
	    //todo: support this
	}
	else {
	    var movingUser = user.getMumbleConnection().userBySession(channelSwitch.id);
	    movingUser.moveToChannel(channelSwitch.channelName);
	}
    });

    socket.on('muteButton', function(isMuted) {
	if(!user.getMumbleConnection() || !user.getMumbleConnection().user)
	    return
	user.getMumbleConnection().user.setSelfMute(isMuted);
    });

    socket.on('deafButton', function(isSelfMuteAndDeaf) {
	if(!user.getMumbleConnection() || !user.getMumbleConnection().user)
	    return
	else if(!isSelfMuteAndDeaf.selfMute && !isSelfMuteAndDeaf.selfDeaf)
	    user.getMumbleConnection().user.setSelfMute(false);
	else
	    user.getMumbleConnection().user.setSelfDeaf(isSelfMuteAndDeaf.selfDeaf);
    });

    socket.on('bitrate', function(bitrate) {
	user.setSampleRate(bitrate);
    });

    socket.on('microphone', function(voiceMessage) {
	if(user.isInitialized()) {
	    var buf = new Buffer(4096);
	    for(var i = 0; i < 2048; i++) {
		buf[2*i+1] = Math.floor(voiceMessage[i]/256);
		buf[2*i] = voiceMessage[i] & 0xff;
	    }
	    user.getInputStream().write(buf);
	}
    });
});
    
function ensureSecure(req, res, next){
    if(req.secure){
	// OK, continue
	return next();
    };
    res.redirect('https://'+req.hostname+req.url); // handle port numbers if you need non defaults
};

app.all('*', ensureSecure); // at top of routing calls

https.listen(443, function(){
    console.log('listening on *:443');
});

http.listen(80, function(){
    console.log('listening on *:80');
});

app.use(express.static(__dirname + '/dist'));

app.use(express.static(__dirname + '/node_modules'));

//todo: try to remove bower and install angular-ui-tree with npm
app.use(express.static(__dirname + '/bower_components'));
