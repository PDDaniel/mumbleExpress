var mumble = require('mumble'),
    fs = require('fs');

var options = {
    key: fs.readFileSync( 'private.pem' ),
    cert: fs.readFileSync( 'public.pem' )
};

console.log( 'Connecting' );
mumble.connect( 'mumble://ball.holdings', options, function ( error, connection ) {
    if( error ) { throw new Error( error ); }

    console.log( 'Connected' );

    connection.authenticate( 'ExampleUser' );
    connection.on( 'initialized', onInit );
//    connection.on( 'voice', onVoice );
    connection.on('textMessage', onText);
    connection.on('ready', function() { console.log(connection.users());});
});

var onInit = function() {
    console.log( 'Connection initialized' );
    // Connection is authenticated and usable.
};

var onVoice = function( voice ) {
    console.log( 'Mixed voice' );

    var pcmData = voice;
};

var onText = function (data) {
    console.log(data.message);
}
