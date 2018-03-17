// enhanced group change
// by godmachine
// march 16, 2018
// based on code taken from https://github.com/Firebottle/Firebot/wiki/Writing-Custom-Scripts
// i love you

function run(runRequest) {
  // Return a Promise object
  return new Promise((resolve, reject) => {
	
	// groupId is the name of the group the button will switch to
	var groupId = runRequest.parameters.group;

	// gamesList is the user-entered list of games this button applies to
	var gamesList = runRequest.parameters.games;
	
	// deniedMsg is the message that is sent when a user clicks on a disabled group
	var deniedMsg = runRequest.parameters.denied;
	
	// whisperTo turns the deniedMsg message into a whisper
	var whisperTo = runRequest.parameters.whisper;
	
    const request = runRequest.modules.request;
    const fs = runRequest.modules.fs;
    
    // Do some stuff

    // key: the name of your button - values: the name of the games as they appear in the site directory
    var games = gamesList.split("\n");

    // this gets the name of the streamer who is logged into firebot so we can find them with the mixer api
    const authFile = JSON.parse(fs.readFileSync(SCRIPTS_DIR + "../auth.json", 'utf8'));
    const streamerName = authFile.streamer.username;


    // let's hit up the mixer api and find the name of the game the streamer is playing
	var url = 'https://mixer.com/api/v1/channels/' + streamerName;
    request(url, function(error, response, data) {
        response = {};

        if (!error) {
            // Got a response from Mixer
            var data = JSON.parse(data);

            // Find the data we want in the Mixer json.
            var current_game = data['type'].name;

            // let's compare this game name to the list of games the streamer has established groups for (see above 'var games')
            if (games.includes(current_game)) {

                // The streamer is playing the game associated with the button the viewer pressed! Let's switch groups!
				response = {
					success: true,
					effects: [
					{
						type: EffectType.CHANGE_GROUP,
						group: groupId
					}]
				}
            } else {
                // the streamer is not playing this game. notify the viewer, and don't switch groups.
				if (whisperTo == true) {
					var message = "/w $(user) " + deniedMsg;
				} else {
					var message = deniedMsg;
				}
				response = {
					success: true,
					effects: [
					{
						type: EffectType.CHAT,
						message: message,
						chatter: "Streamer"
					}]
				}
            }
			
			


            
        } else {
            // We had an error with the Mixer request. So, create an error popup in Firebot.

            // Create a failed response
            response = {
                success: false,
                errorMessage: "There was an error retrieving data from the Mixer API."
            }
        }
        // Resolve Promise with the response object
        resolve(response);
    })

  });
}

function getDefaultParameters() {
    return new Promise((resolve, reject) => {
        resolve({
            "group": {
                "type": "string",
                "description": "Enter the name of the group this button will switch to when clicked"
            },
			"games": {
				"type": "string",
				"useTextArea": true,
				"description": "Enter each game that applies to this group, one per line. Enter them exactly as they are on Mixer. If it's all caps there, type it in all caps here.",
				"secondaryDescription": "Multi-game example: You have a 'Battlefield' group that you'd like to use for multiple Battlefield games, list each game here."
			},
			"denied": {
				"type": "string",
				"description": "Enter a message you'd like to display when a user clicks on the button when it's disabled (Optional)"
			},
			"whisper": {
				"type": "boolean",
				"description": "Send that message as a whisper to the button presser",
				"default": false
			}
        });
    });
}
exports.getDefaultParameters = getDefaultParameters;

exports.getScriptManifest = function() {
	return {
		name: "Game Based Group Change",
		description: "Gives you control over when your game-specific button groups can be used.",
		author: "godmachine",
		version: "1.1",
		website: "https://twitter.com/g0dmach1ne"
	}
}

// Export 'run' function so it is visible to Node
exports.run = run;