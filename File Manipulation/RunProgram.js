exports.getDefaultParameters = function() {
	return new Promise((resolve) => {
		resolve({
			filePath: {
				type:"string",
				description:"Filepath To Program",
				default: "C:\\Program Files (x86)\\Some\\App.exe"
			},
			arguments: {
				type:"string",
				useTextArea: true,
				description:"Arguments For Program (Seperate each w/newline)",
				default: "someArgument\nandAnother"
			}
		});
	});
}

exports.run = function(runRequest) {
   

	let filePath = runRequest.parameters.filePath;
	let args = runRequest.parameters.arguments.split("\n");
	
	let spawn = runRequest.modules.spawn;
    let s = spawn(filePath, args);
	
	s.stdout.on('data', (data) => {
	  console.log(`stdout: ${data}`);
	});
}