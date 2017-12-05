exports.getDefaultParameters = function() {
	return new Promise((resolve, reject) => {
		resolve({
			onlineMessageTemplate: {
				type: "string",
				description: "Online Message Template",
				secondaryDescription: "The message to show in chat when you're streaming.",
				default: "${streamerName} been streaming for ${time}"				
			},
			offlineMessageTemplate: {
				type: "string",
				description: "Offline Message Template",
				secondaryDescription: "The message to show in chat when you aren't streaming.",
				default: "${streamerName} doesn't appear to be streaming right now."				
			},
			chatter: {
				type: "enum",
				options: ["Streamer", "Bot"],
				default: "Streamer",
				description: "Send From",
				secondaryDescription: "Which account to send the messages from."
			}
		});		
	});
}

exports.getScriptManifest = function() {
	return {
		name: "Uptime",
		description: "Allows you to display the streams uptime in chat.",
		author: "ThePerry & ebiggz",
		version: "1.0"	
	}
}

exports.run = function(runRequest) {
	// Return a Promise object
	return new Promise((resolve, reject) => {
				
		let onlineMsgTemplate = runRequest.parameters.onlineMessageTemplate;
		let offlineMsgTemplate = runRequest.parameters.offlineMessageTemplate;	
		
		const fs = runRequest.modules.fs;	
		const authFile = JSON.parse(fs.readFileSync(SCRIPTS_DIR + "../auth.json", 'utf8'));
		
		const channelId = authFile.streamer.channelId;
	
		let url = 'https://mixer.com/api/v1/channels/'+channelId+'/manifest.light2';
		
		const request = runRequest.modules.request;
		request(url, function (error, response1, data) {
			var response = {};
			if (!error) {
				// Got response from Mixer.
				var data = JSON.parse(data);

				let streamerName = authFile.streamer.username;
				
				let message;
				if (data.statusCode === 404) {				
					message = offlineMsgTemplate.replace("${streamerName}", streamerName);
				} else {
					
					let start = new Date(data.startedAt);
					let now = new Date(data.now);
					
					let diffInMills = now - start;
					
					message = onlineMsgTemplate
							.replace("${time}", getUptimeString(diffInMills))
							.replace("${streamerName}", streamerName);
				}
				
				// Create a success response 
				response = {
					success: true,
					effects:[
						{
							type: EffectType.CHAT,
							message: message,
							chatter: runRequest.parameters.chatter
						}
					]
				}
			} else {
				// We had an error with the mixer request. So, create an error popup in Firebot.
				// Create a failed response
				response = {
					success: false,
					errorMessage: 'There was an error retrieving data from the Mixer API.'
				}
			}
			// Resolve Promise with the response object
			resolve(response);
		})
	});
}

function getUptimeString(diffInMills) {
	let allSecs = diffInMills/1000;

    allSecs = Math.round(allSecs);
    let hours = Math.floor(allSecs / (60 * 60));

    let divisor_for_minutes = allSecs % (60 * 60);
    let minutes = Math.floor(divisor_for_minutes / 60);

    let divisor_for_seconds = divisor_for_minutes % 60;
    let seconds = Math.ceil(divisor_for_seconds);

	let hasHours = hours > 0, hasMins = minutes > 0, hasSecs = seconds > 0;

	let uptimeStr = "";
	
	if(hasHours) {
		uptimeStr = hours + " hour";
		if(hours > 0) {
			uptimeStr = uptimeStr + "s";
		}
	}
	if(hasMins) {
		if(hasHours) {
			uptimeStr = uptimeStr + ",";
		}
		uptimeStr = uptimeStr + " " + minutes + " minute";
		if(minutes > 0) {
			uptimeStr = uptimeStr + "s";
		}
	}
	if(hasSecs) {
		if(hasHours || hasMins) {
			uptimeStr = uptimeStr + ",";
		}
		uptimeStr = uptimeStr + " " + seconds + " second";
		if(seconds > 0) {
			uptimeStr = uptimeStr + "s";
		}
	}
	
    return uptimeStr;
}