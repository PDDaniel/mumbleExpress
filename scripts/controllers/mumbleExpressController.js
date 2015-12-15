app.controller('mumbleExpressController', function($scope, /*notification,*/ $rootScope, channelTree, socket) {

    var defaultUsername = "MumbleExpress";

    function isValidHostname(str) {
	return /((^\s*((([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))\s*$)|(^\s*((([0-9A-Fa-f]{1,4}:){7}([0-9A-Fa-f]{1,4}|:))|(([0-9A-Fa-f]{1,4}:){6}(:[0-9A-Fa-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){5}(((:[0-9A-Fa-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9A-Fa-f]{1,4}:){4}(((:[0-9A-Fa-f]{1,4}){1,3})|((:[0-9A-Fa-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){3}(((:[0-9A-Fa-f]{1,4}){1,4})|((:[0-9A-Fa-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){2}(((:[0-9A-Fa-f]{1,4}){1,5})|((:[0-9A-Fa-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9A-Fa-f]{1,4}:){1}(((:[0-9A-Fa-f]{1,4}){1,6})|((:[0-9A-Fa-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9A-Fa-f]{1,4}){1,7})|((:[0-9A-Fa-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))(%.+)?\s*$))|(^\s*((?=.{1,255}$)(?=.*[A-Za-z].*)[0-9A-Za-z](?:(?:[0-9A-Za-z]|\b-){0,61}[0-9A-Za-z])?(?:\.[0-9A-Za-z](?:(?:[0-9A-Za-z]|\b-){0,61}[0-9A-Za-z])?)*)\s*$)/.test(str);
    }

    function isValidUsername(str) {
	return /^[-=\w\[\]\{\}\(\)\@\|\.]+$/.test(str);
    }

    function decodeSample(a, b) {
	var ret = a*256 + b;
	if(ret > 32767) {
	    ret -= 65536;
	}
	return ret/32768;
    }

    function encodeSample(sample) {
	sample = sample*32768;
	if(sample < 0) {
	    sample += 65536;
	}
	return Math.floor(sample);
    }


    var audioBufferPos = 0;
    var audioBuffer = [];

    function pcmSource() {
	if(audioBufferPos == audioBuffer.length) {
	    return 0;
	} else {
	    return audioBuffer[audioBufferPos++];
	}
    }

    var audioContext;
    try {
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	audioContext = new AudioContext();
    } catch(e) {
	alert('Web Audio API is not supported in this browser');
    }

    var bufferSize = 4096;
    var pcmProcessingNode = audioContext.createScriptProcessor(bufferSize, 1, 1);
    pcmProcessingNode.onaudioprocess = function(e) {
	var output = e.outputBuffer.getChannelData(0);
	for (var i = 0; i < bufferSize; i++) {
	    // Generate and copy over PCM samples.
	    output[i] = pcmSource();
	}
    }
    pcmProcessingNode.connect(audioContext.destination);

    
    //set up html5 notifications
    /*
    function notify(textMessage) {
	var notification = $notification(textMessage.userName + " sent a message at " + textMessage.time, {
	    body: textMessage.message,
	    //icon:'icon.png',
	    dir:'auto',
	    focusWindowOnClick: true,
	    delay: 8000
	});
    }

    $notification.requestPermission();
*/

    $scope.channelTree = channelTree.tree;

    //update object in controller when channelTree is changed
    $scope.$on( 'tree.update', function( event ) {
	$scope.channelTree = channelTree.tree;
    });
    
    //set up dynamic tree view callbacks
    $scope.treeOptions = {
	accept: function(sourceNodeScope, destNodesScope, destIndex) {
	    if(!destNodesScope.$modelValue ||
	       (destNodesScope.$modelValue[0] &&
		destNodesScope.$modelValue[0].channelId == 0))
		return false;
	    else
		return true;
	},
	dropped: function(event) {
	    var srcObj = event.source.nodeScope.$modelValue;
	    var srcParent = event.source.nodeScope.$parentNodeScope.$modelValue;
	    var dstParent = event.dest.nodesScope.$parent.$modelValue;

	    if(srcParent == dstParent)
		return;
	    
	    var channelSwitch = {
		"isChannel": srcObj.isChannel,
		"id": srcObj.isChannel? srcObj.channelId : srcObj.session,
		"channelName": dstParent.name
	    };
	    socket.emit('change channels', channelSwitch);

	    //move node back to original position in tree.
	    //if the position changes, server will tell us
	    srcObjId = srcObj.isChannel? srcObj.channelId : srcObj.session;
	    channelTree.deleteFromTree(srcObj.isChannel, srcObjId);
	    channelTree.insertIntoTree(srcObj, srcParent.channelId);
	}
    };

    //set up message box
    var d = new Date();
    $scope.msgs = [
	{
	    "userName": defaultUsername,
	    "message": "Enter server address",
	    "time": ''+d.getHours()+':'+d.getMinutes()
	}
    ];
    d = null;

    //set up buttons
    $scope.user = {};
    $scope.user.muted = true;
    $scope.user.deafened = false;
    var muteState =  true;

    $scope.deafButton = function() {
	if(!$scope.user.deafened)
	    $scope.user.muted = muteState;
	
	socket.emit('deafButton',
		    {
			selfMute: $scope.user.muted,
			selfDeaf: $scope.user.deafened
		    }
		   );
    };
    
    $scope.muteButton = function() {
	muteState = $scope.user.muted;
	if(!$scope.user.muted)
	    $scope.user.deafened = false;

	socket.emit('muteButton', $scope.user.muted);
    };

    var currentChannel = null;
    var selectedNode = null;
    var tempSelectedNode = null;

    $scope.getChannelNameFromId = function (channelId) {
	node = channelTree.getFromTree(true,channelId);
	return node.name;
    };
    
    //on click of item in tree
    $scope.selectNode = function(node) {
	var id = node.isChannel? node.channelId : node.session;
	selectedNode = {
	    "isChannel": node.isChannel,
	    "id": id
	}
    };

    //on mouseover of item in tree
    $scope.tempSelectNode = function(node) {
	var id = node.isChannel? node.channelId : node.session;
	tempSelectedNode = {
	    "isChannel": node.isChannel,
	    "id": id
	}
    };

    $scope.tempUnSelectNode = function() {
	tempSelectedNode = null;
    };
    
    $scope.selectedNode = function(node) {
	if(selectedNode && (node.isChannel == selectedNode.isChannel)) {
	    var id = node.isChannel? node.channelId : node.session;
	    if(id == selectedNode.id)
		return true;
	}
	if(tempSelectedNode && (node.isChannel == tempSelectedNode.isChannel)) {
	    var id = node.isChannel? node.channelId : node.session;
	    if(id == tempSelectedNode.id)
		return true;
	}
	return false;
    };

    var loginState = 0;
    var loginInfo = {};
    
    $scope.sendMsg = function() {
	//connect to the server using first few messages as info
	var d = new Date();
	if(loginState == 0) { //server ip
	    if(isValidHostname($scope.msg.text)) {
		loginInfo.ip = $scope.msg.text;
		loginState++;
		var textMessage = {
		    "userName": defaultUsername,
		    "message": "Enter port (if blank, will be default of 64738)",
		    "time": ''+d.getHours()+':'+d.getMinutes(),
		    "recipient": null
		}
	    }
	    else {
	    	var textMessage = {
	    	    "userName": defaultUsername,
	    	    "message": "\"" + $scope.msg.text + "\" is not a valid hostname. Reenter server address",
	    	    "time": ''+d.getHours()+':'+d.getMinutes(),
		    "recipient": null
	    	};
		$scope.msgs.push(textMessage);
		return;
	    }
	}
	else if(loginState == 1) { //port
	    loginInfo.port = $scope.msg.text == '' ? "64738" : $scope.msg.text;
	    loginState++;
	    var textMessage = {
		"userName": defaultUsername,
		"message": "Enter user name",
		"time": ''+d.getHours()+':'+d.getMinutes(),
		"recipient": null
	    }
	}
	else if(loginState == 2) { //username
	    if(isValidUsername($scope.msg.text)) {
		loginInfo.userName = $scope.msg.text;
		loginState++;
		var textMessage = {
		    "userName": defaultUsername,
		    "message": "Enter password",
		    "time": ''+d.getHours()+':'+d.getMinutes(),
		    "recipient": null
		}
	    }
	    else {
		var textMessage = {
		    "userName": defaultUsername,
	    	    "message": "\"" + $scope.msg.text + "\" is not a valid username. Reenter server address",
		    "time": ''+d.getHours()+':'+d.getMinutes(),
		    "recipient": null
		}
		$scope.msgs.push(textMessage);
		return;
	    }
	}
	else if(loginState == 3) { //password
	    loginInfo.password = $scope.msg.text;
	    loginInfo.muted = $scope.user.muted;
	    loginInfo.deafened = $scope.user.deafened;
	    loginState++;
	    //transmit info to server
	    socket.emit('login', loginInfo);
	    $scope.msg.text = '';
	    return;
	}
	else {
	    //else, sending message

	    if($scope.msg.text=='')
		return;
	    
	    var recipient = { //who to send message to
		"isChannel": true, //todo: support sending to user
		"id": currentChannel
	    };

	    var textMessage = {
		"userName": loginInfo.userName,
		"message": $scope.msg.text,
		"time": ''+d.getHours()+':'+d.getMinutes(),
		"recipient": recipient
	    };
	    socket.emit('send msg', textMessage);
	}
	$scope.msgs.push(textMessage);
	$scope.msg.text = '';
    };

    socket.on('errorMessage', function(errorMessage) {
	var d = new Date();
	var textMessage = {
	    "userName": defaultUsername,
	    "message": errorMessage,
	    "time": ''+d.getHours()+':'+d.getMinutes()
	}
	$scope.msgs.push(textMessage);
    });
    
    socket.on('textMessage', function(textMessage) {
	//append local time to textMessage object as string
	//(collected on client so locality is not an issue)
	var d = new Date();
	textMessage["time"]=''+d.getHours()+':'+d.getMinutes();
	textMessage["recipient"]=null; //incoming message

	//receive remote message
	$scope.msgs.push(textMessage);
	notify(textMessage);
    });

    socket.on('voiceMessage', function(data) {
	data = new Uint8Array(data);
	for(var i = 0; i < data.length; i += 2) {
	    audioBuffer.push(decodeSample(data[i+1], data[i]));
	}
    });

    var initialized = false;
    socket.on('ready', function() {
	initialized = true;
    });
    
    socket.on('userState', function(state) {
	if(state.name) { // a new user connected

	    //create a node object for insertion into tree
	    var node = {
		"name": state.name,
		"session": state.session,
		
		"isChannel": false,
		"channelId": null,
		
		"muted": (state.self_mute || state.self_deaf),
		"deafened": state.self_deaf,

		"children": []
	    };
	    if(initialized) {
		//log the connection to chatbox
		var d = new Date();
		var textMessage = {
		    "userName": node.name,
	    	    "message": "connected",
		    "time": ''+d.getHours()+':'+d.getMinutes(),
		    "recipient": null
		}
		$scope.msgs.push(textMessage);
	    }

	    var parentChannel = state.channel_id;
	    if(parentChannel == null) {
		//make those in the root channel a child of the
		//root node for cleaner rendering. Why doesn't
		//mumble do this by default?
		parentChannel = 0;
	    }

	    if(node.name == loginInfo.userName) { //updating the user's position
		loginInfo.session = node.session;
		currentChannel = parentChannel;
	    }


	    channelTree.insertIntoTree(node,parentChannel);
	    return;
	}
	
	//update user info
	node = channelTree.getFromTree(false,state.session);

	if(state.channel_id!=null) { //updating user position
	    channelTree.deleteFromTree(false, state.session);
	    channelTree.insertIntoTree(node,state.channel_id);

	    if(state.session == loginInfo.session) { //updating the user's position
		currentChannel = state.channel_id;
		$scope.selectNode(node); //when user moves, select new channel by default
	    }
	    else {
		//log the move to chatbox
		var newChannel = channelTree.getFromTree(true, state.channel_id);
		var d = new Date();
		var textMessage = {
		    "userName": node.name,
	    	    "message": "moved to "+newChannel.name,
		    "time": ''+d.getHours()+':'+d.getMinutes(),
		    "recipient": null
		}
		$scope.msgs.push(textMessage);
	    }
	}

	if(state.self_deaf==true) { //user deafened, must be mute also
	    node.deafened = state.self_mute = true;
	    if(node.name == loginInfo.userName) {
		$scope.user.muted = $scope.user.deafened = true;
	    }
	}

	if(state.self_deaf==false) { //user undeafened
	    node.deafened = false;
	    if(node.name == loginInfo.userName) {
		$scope.user.deafened = false;
	    }
	}

	if(state.self_mute!=null) { //updating user mute
	    node.muted=state.self_mute;
	    if(node.name == loginInfo.userName) {
		$scope.user.muted = state.self_mute;
	    }
	}

	if(state.self_mute != null || state.self_deaf != null) {
	    //log the mute/deaf to chatbox
	    var muteDeafMessage = '';
	    if(state.self_deaf == true)
		muteDeafMessage = "muted and deafened";
	    else if(state.self_deaf == false)
		muteDeafMessage = node.muted? "undeafened" : "unmuted and undeafened";
	    else if(state.self_mute == true)
		muteDeafMessage = "muted";
	    else if(state.self_mute == false)
		muteDeafMessage = "unmuted";
	    var d = new Date();
	    var textMessage = {
		"userName": node.name,
		"message": muteDeafMessage,
		"time": ''+d.getHours()+':'+d.getMinutes(),
		"recipient": null
	    };
	    $scope.msgs.push(textMessage);
	}

    });

    socket.on('channelState', function(state) {
	var node = {
	    "name": state.name,
	    "session": null,
	    
	    "isChannel": true,
	    "channelId": state.channel_id,
	    
	    "muted": state.self_mute,
	    "deafened": state.self_deaf,
	    
	    "children": []
	};
	channelTree.insertIntoTree(node,state.parent);
    });

    socket.on('channelRemove', function(state) {
	channelTree.deleteFromTree(true, state.channel_id);
    });

    socket.on('userRemove', function(state) {
	node = channelTree.getFromTree(false,state.session);
	//log the disconnection to chatbox
	var d = new Date();
	var textMessage = {
	    "userName": node.name,
	    "message": "disconnected",
	    "time": ''+d.getHours()+':'+d.getMinutes(),
	    "recipient": null
	}
	$scope.msgs.push(textMessage);

	channelTree.deleteFromTree(false, state.session);
    });

    var initializeMicrophone = function(e){
	// creates the audio context
	var context = new AudioContext();
	
	// let the server know what bitrate we're using
	socket.emit('bitrate', context.sampleRate);
	
	// creates a gain node
	volume = context.createGain();
	
	// creates an audio node from the microphone incoming stream
	audioInput = context.createMediaStreamSource(e);
	
	// connect the stream to the gain node
	audioInput.connect(volume);
	
	/* From the spec: This value controls how frequently the audioprocess event is 
	   dispatched and how many sample-frames need to be processed each call. 
	   Lower values for buffer size will result in a lower (better) latency. 
	   Higher values will be necessary to avoid audio breakup and glitches */
	var bufferSize = 2048;
	recorder = context.createScriptProcessor(bufferSize, 1, 1);
	
	recorder.onaudioprocess = function(e){
            var input = e.inputBuffer.getChannelData(0);
	    var voiceMessage = new Uint16Array(input.length);
	    for(var i = 0; i < input.length; i++) {
	    	voiceMessage[i] = encodeSample(input[i]);
	    }
	    socket.emit('microphone', voiceMessage);
	}
	
	// we connect the recorder
	volume.connect (recorder);
	recorder.connect(context.destination);
    }

    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia || navigator.msGetUserMedia;
    
    if (navigator.getUserMedia){
	navigator.getUserMedia({audio:true}, initializeMicrophone, function(e) {
	    alert('Error capturing audio.');
	});
    } else alert('getUserMedia not supported in this browser.');

});
