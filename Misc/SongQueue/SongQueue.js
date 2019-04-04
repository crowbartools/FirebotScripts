exports.getScriptManifest = function() {
	return {
		name: "Song Queue",
		description: "Maintains a song queue in a txt file so you can show it on your stream. Subs automatically get requests pushed in front of non-sub requests.",
		author: "ebiggz",
		version: "1.8"
	}
}

function getDefaultParameters() {
    return new Promise((resolve, reject) => {
        resolve(
        {
          "dataFolderPath": {
            type: "filepath",
            description: "Song Queue Data Folder",
            secondaryDescription: "Please select a folder you want the song queue data to be saved in. A couple files will be created in here. The one you want to load in your broadcasting software will be 'songqueue.txt'.",
            fileOptions: {
              title: "Select Song Queue Data Folder",
              buttonLabel: "Select",
              directoryOnly: true,
              filters:[]
            }
          },
          "mode": {
            type: "enum",
            description: "Mode",
            secondaryDescription: "Whether or not you want this to listen for regular commands or management commands (ie mod commands). It's recommended this script is added to two seperate commands, one for regular viewers and one for mods (Remember to set permissions for the mod version).",
            options: ["Regular(Viewer cmds)", "Management(Mod cmds)"],
            default: "Regular(Viewer cmds)"
          },
          "chatter": {
            type: "enum",
            description: "Chat As",
            secondaryDescription: "Which account to send chat messages as.",
            options: ["Streamer", "Bot"],
            default: "Streamer"
          },
          "queueLength": {
            type: "number",
            description: "Queue Length",
            secondaryDescription: "The maximum number of songs that can exist in the queue.",
            default: 10	
          },
          "emptyQueueText": {
            type: "string",
            description: "Empty Queue Text",
            useTextArea: true,
            secondaryDescription: "The text to show when there is no songs in the queue.",
            default: 'No songs in the queue.\n\nType "!ss Song Title" to request one!'
          },
          "requestCooldownLength": {
            type: "number",
            description: "Request Cooldown Length",
            secondaryDescription: "The number of minutes before a user can add another song request. (regular mode only)",
            default: 60
          },
          "songBlacklist": {
            type: "string",
            useTextArea: true,
            description: "Song Blacklist",
            secondaryDescription: "Coma seperated list of songs you don't want requested. The entires are case-insensitive and is 'smart' meaning it will automatically detect slight variations including repeating duplicate characters so you just need to add the most common version of a song name. (regular mode only)",
            default: "Ali a, through the fire and flames, ttfaf"	
          }
      });
  });
}
exports.getDefaultParameters = getDefaultParameters;

// all mod cmds that modify the queue in anyway trigger this cooldown to prevent
// multiple mods from accidentally doing the same command at the same time (ie !sq next)
function triggerModCmdCooldown() {
  global.modModifyCmdsOnCooldown = true;
  setTimeout(() => {
    global.modModifyCmdsOnCooldown = false;
  }, 2000);
}

function addHistoryAction(username) {
  //make sure array exists
  if(global.SQHistory == null) {
    global.SQHistory = [];
  }
  // add new action to history array
  global.SQHistory.push(
    { 
      queue: JSON.parse(JSON.stringify(global.songQueue)), 
      cooldowns: JSON.parse(JSON.stringify(global.sqCooldowns)),
      bank: JSON.parse(JSON.stringify(global.requestBankDb)),
      username: username
    }
  );
  //trim array if its longer than 20
  if(global.SQHistory.length > 20) {
    global.SQHistory.shift();
  }
}

//empty response
const response = {success: true, effects: []};

function run(runRequest) {
  return new Promise((resolve, reject) => {

    // dont do anything if this isnt triggered by a command
    if(runRequest.trigger.type != "command") {
      resolve(response)
      return;
    }

    let moment = runRequest.modules.moment;

    let chatModule =  runRequest.modules.chat;
    let messageId = runRequest.trigger.metadata.chatEvent.id;
    let chatter = runRequest.parameters.chatter;

    function message(text, target) { 
      let message = `${target == null ? '/me' : ''} [SongQueue] ${text}`;
      chatModule.smartSend(message, target, chatter);
    }

    if(global.Levenshtein == null) {
      setLevenshtein();
    }

    let queueLength = runRequest.parameters.queueLength;

    let fs = runRequest.modules.fs,
    JsonDb = runRequest.modules.JsonDb; 
    datafolderPath = runRequest.parameters.dataFolderPath;

    const songListTxtPath = `${datafolderPath}\\songqueue.txt`;
    const songListCachePath = `${datafolderPath}\\queuecache.json`;

    const requestBankPath = `${datafolderPath}\\requestbank.json`;
    const statsPath = `${datafolderPath}\\stats.json`;

    // ensure files exist
    if(!fs.existsSync(songListTxtPath)) {
      fs.writeFileSync(songListTxtPath, "", 'utf8');
    }
    if(!fs.existsSync(songListCachePath)) {
      fs.writeFileSync(songListCachePath, '{ "requestqueue": [], "cooldowns": {} }', 'utf8');
    }

    if(!fs.existsSync(requestBankPath)) {
      fs.writeFileSync(requestBankPath, "{}", 'utf8');
    }

    if(!fs.existsSync(statsPath)) {
      fs.writeFileSync(statsPath, '{ "alltime": { "viewers": {}, "songs": {} }', 'utf8');
    }

    let cacheDb = new JsonDb(songListCachePath, true, true);

    let requestBankDb = new JsonDb(requestBankPath, true, true);

    let statsDb = new JsonDb(statsPath, true, true);

    // load cache if needed
    if(global.songQueue == null) {
      try {
        global.songQueue = cacheDb.getData("/requestqueue");
        global.sqCooldowns = cacheDb.getData("/cooldowns");
        global.queueDisabled = cacheDb.getData("/disabled");
        global.queueFreeRequests = cacheDb.getData("/freerequests");
      } catch (err) {}
    }

    if(global.requestBankDb == null) {
      try {
        global.requestBankDb = requestBankDb.getData("/");  
      } catch (err) {}
      if(global.requestBankDb == null) {
        global.requestBankDb = {};
      }
    }


    if(global.sqStats == null) {
      try {
        global.sqStats = statsDb.getData("/");    
        if(global.sqStats == null || global.sqStats.alltime == null) {
          global.sqStats = { 
            alltime: {
              viewers: {},
              songs: {}
            }
          }
          statsDb.push("/",global.sqStats);
        }
      } catch (err) {}
      if(global.sqStats == null) {
        global.sqStats = {};
      }
    }

    if(global.sqCooldowns == null) {
      global.sqCooldowns = {};
    }
    if(global.songQueue == null) {
      global.songQueue = [];
    }
    if(global.queueDisabled == null) {
      global.queueDisabled = false;
    }
    if(global.sqPermittedUsers == null) {
      global.sqPermittedUsers = [];
    }
    if(global.requestHistory == null) {
      global.requestHistory = [];
    }

    function undoLastAction() {
      if(global.SQHistory == null) return;
      //get last action
      let last = global.SQHistory.pop();
      if(last != null) {
        global.songQueue = last.queue;
        global.sqCooldowns = last.cooldowns;
        global.requestBankDb = last.bank;
        requestBankDb.push("/", global.requestBankDb);
      }
    }

    function getRequestBalance(username) {
      return global.requestBankDb[username] || 0;
    }

    function updateRequestBalance(username, amount, override = false) {
      let previousBalance = getRequestBalance(username);
      let newBalance = override ? amount : previousBalance + amount;
      if(newBalance < 0) {
        newBalance = 0;
      }
      console.log(`Updating requests for viewer ${username}. Amount: ${amount} | Prev Bal: ${previousBalance} | New Bal: ${newBalance}`);
      global.requestBankDb[username] = newBalance;
      try {
        requestBankDb.push(`/${username}`, newBalance);
      } catch(err) {}
      return newBalance;
    }

    function escapeRegExp(str) {
      return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"); // eslint-disable-line no-useless-escape
    }

    function replaceAll(string, text, replacement = "") {
      return string.replace(new RegExp(escapeRegExp(text), "g"), replacement);
    }

    function getStatForTypeAndBucket(type, bucket, id) {
      let count = 0;
      try {
        count = statsDb.getData(`/${type}/${bucket}/${id}`);
      } catch(error) {
      };
      return count;
    }

    function incrementStatForTypeAndBucket(type, bucket, id) {
      if(type == null || bucket == null || id == null) return;

      // clean id property for saving to db
      id = replaceAll(id, "/", "");
      id = replaceAll(id, "\"", "");

      let currentStat = getStatForTypeAndBucket(type, bucket, id);
      let updatedStat = currentStat + 1;

      global.sqStats[type][bucket][id] = updatedStat;

      statsDb.push(`/${type}/${bucket}/${id}`, updatedStat);
    }

    function recordStatForRequest(songRequest) {
      if(songRequest == null || songRequest.user == null || songRequest.song == null) return;

      let userName = songRequest.user.name;
      incrementStatForTypeAndBucket("alltime", "viewers", userName);

      let songName = songRequest.song;
      incrementStatForTypeAndBucket("alltime", "songs", songName);
    }

    let command = runRequest.command,
        args = command.args,
        user = runRequest.user,
        isSub = runRequest.trigger.metadata.chatEvent.user_roles.includes("Subscriber");

    //create history snapshot
    if(args.length > 0 && args[0].toLowerCase() !== "undo") {
      addHistoryAction(user.name);
    }

    /**
     * 
     * 
     * 
     * REGULAR MODE
     * 
     * 
     * 
     */
    if(runRequest.parameters.mode === "Regular(Viewer cmds)") {

      global.sqViewerTrigger =  command.trigger;

      let skipAdd = false;
      if(args.length === 1) {
        let arg = args[0].toLowerCase();
        if(arg === "wrong" || arg === "wrongsong" || arg === "unrequest" || arg === "removesong") {
          skipAdd = true;

          let userSongs = global.songQueue.filter((r, index) => index > 0 && r.user.name === user.name);
          userSongs.forEach(r => {
            if(r.user.spentRequest) {
              updateRequestBalance(r.user.name, 1);
            }
          });

          global.songQueue = global.songQueue.filter((r, index) =>  index === 0 || (index > 0 && r.user.name !== user.name));

          if(userSongs.length < 1) {
            message("Either you have no songs in the queue or your song is the current one and cannot be removed.", user.name);
            return resolve();

          } else {
            message("Removed your song(s) from the queue, reset your cooldown, and updated your request count.", user.name);
          
            global.sqCooldowns[user.name] = undefined;
          }
        }
        else if(arg == "requests" || arg == "request" || arg == "tokens" || arg == "token") {
          skipAdd = true;
          let requests = global.requestBankDb[user.name] || 0;
          message(`@${user.name} has ${requests} song request token(s).`);
          return resolve();
        }
        else if(arg === "requesthistory") {
          skipAdd = true;
          if(global.requestHistory.length < 1) {
            message(`There has been no previously requested songs.`, user.name);
          } else {
            let songList = global.requestHistory.join(", ");
            message(`Previously requested songs: ${songList}`, user.name);
          }
        }
        else if (arg === "give") {
          chatModule.deleteChat(messageId);
          message(`Invalid ${args[0]} command usage. ${command.trigger} ${args[0]} @viewername`, user.name);
          return resolve();
        }
      } else if(args.length === 2 && args[0].toLowerCase() === "give") {  

          let giverRequests = getRequestBalance(user.name);
          if(giverRequests < 1) {
            message(`You currently don't have any request tokens to give. You can get request tokens by donating, subscribing, or buying one with sparks. :)`, user.name);
            return resolve(response);
          }

          updateRequestBalance(user.name, -1);

          let target = command.args[1].replace("@", "");
          
          let amount = 1;

          let balance = getRequestBalance(target);
          let newBalance = balance + amount;
          let updatedBal = updateRequestBalance(target, newBalance, true);

          message(`Gave a request token to ${target}. You now have ${giverRequests - 1} request(s) remaining.`, user.name);

          let roles = runRequest.trigger.metadata.chatEvent.user_roles;

          if(roles && (roles.includes("Mod") || roles.includes("Owner"))) {
            message(`***Mod Warning: You just used the viewer version of the "give" token command which means it took a token from your personal request pool. If this was in error, don't forget to give yourself back a token!***`, user.name);
          }

          let requestCmd = global.sqViewerTrigger || "!ss";
          message(`${user.name} has given you a song request token! You now have ${updatedBal} total request(s). Use one by typing "${requestCmd} Song Title". See a list of available songs by typing "!list" <3`, target);
          skipAdd = true;
      }


      let songName = command.args.join(" ");
      if(!skipAdd && songName != null && songName.length > 0) {

        if(global.queueDisabled) {
          chatModule.deleteChat(messageId);
          message("The queue is currently disabled and not taking requests. Please try again once it's enabled!", user.name);     
          resolve(response);
          return;
        }

        if(global.queueFreeRequests !== true) {
          let requests = getRequestBalance(user.name);
          if(requests < 1) {
            message(`@${user.name}, you currently don't have any requests to use for this. You can get requests by donating, subscribing, or buying one with sparks. You can also wait for a Free Requests day! :)`);
            return resolve(response);
          }
        }
  
        let currentCooldown = global.sqCooldowns[user.name];
        if(currentCooldown != null && moment().isBefore(currentCooldown)) {
          chatModule.deleteChat(messageId)
          message("You can request another song " + moment().to(currentCooldown), user.name);     
          resolve(response);
          return;
        }
       
        if(global.songQueue.length > queueLength) {
          chatModule.deleteChat(messageId);
          message(`Sorry @${user.name}, the song queue is currently full. Please try requesting later!`);

          resolve(response);
          return;
        }

        if(songName.length > 40) {
          chatModule.deleteChat(messageId);
          message(`This song name is too long!`, user.name);

          resolve(response);
          return;
        }

        let blacklistRaw = runRequest.parameters.songBlacklist,
          blacklist = [];
        if(blacklistRaw != null && blacklistRaw.length > 0) {
          blacklist = blacklistRaw.split(",").map(s => s.trim());
        }

        if(blacklist.length > 0 && songIsInList(blacklist, songName)) {
          chatResponse = message(`Sorry, you cannot request this song.`, user.name);
          chatModule.deleteChat(messageId);
          resolve(response)
          return;
        }


        if(songAlreadyAdded(songName)) {
          message(`This song is already in the queue!`, user.name);
          chatModule.deleteChat(messageId);
          resolve(response)
          return;
        }

        //update cooldown
        global.sqCooldowns[user.name] = 
        moment()
          .add(runRequest.parameters.requestCooldownLength, 'm')
          .format();

        //transact request
        let spentRequest = false;
        if(global.queueFreeRequests !== true) {
          updateRequestBalance(user.name, -1);
          spentRequest = true;
        }

        // add new song
        songName = capitalize(songName);
        let request = { 
          song: songName, 
          user: { 
            name: runRequest.user.name, 
            sub: isSub,
            spentRequest: spentRequest, 
            timestamp: Date.now()
          }
        };

        let index;
        let subPriority = false;
        if(global.songQueue.length > 0 && isSub && !global.queueFreeRequests) {
          subPriority = true;
          let firstNonSubRequestIndex = global.songQueue
            .slice(1, global.songQueue.length)
            .findIndex(r => r.user.sub === false) + 1;

          if(firstNonSubRequestIndex === 0) {
            global.songQueue.push(request);
            index = global.songQueue.length-1;
          } else {
            global.songQueue.splice(firstNonSubRequestIndex, 0, request);
            index = firstNonSubRequestIndex;
          }
        } else {

          let useZeroIndex = false;
          if(global.songQueue.length === 0) {
            global.songQueue.push(null);
            useZeroIndex = true;
          }

          global.songQueue.push(request);
          index = useZeroIndex ? 0 : global.songQueue.length-1;      
        }

        let queuePosition = index > 1 ? `[Queue position: ${index}${subPriority ? " - Subscriber priority" : ""}]` : ` and it's next up!${subPriority ? " [Subscriber priority]" : ""} `;
        message(`@${runRequest.user.name} has requested the song "${songName}" ${queuePosition}`);

        if(spentRequest) {
          message(`You have ${getRequestBalance(user.name)} request token(s) remaining.`, user.name);
        }

        if(global.sqPermittedUsers.includes(user.name)) {
          global.sqPermittedUsers = global.sqPermittedUsers.filter(v => v !== user.name);
        }
      }

    /**
     * 
     * 
     * 
     * MOD MODE
     * 
     * 
     * 
     */
    } else {

      global.sqModTrigger =  command.trigger;

      args = args.map(a => a.toLowerCase());
      if(args.length === 1) {
        if(global.modModifyCmdsOnCooldown) {
          message(`Mod commands on cooldown for a couple seconds to prevent duplicate commands.`, user.name);

          resolve(response);
          return;
        }
        
        if(args[0] == "clear" || args[0] == "reset") {

          global.songQueue.forEach(r => {
            if(r.user.spentRequest) {
              updateRequestBalance(r.user.name, 1);
            }
          }); 
          
          global.songQueue = [];
          global.sqCooldowns = {};
          message(`Queue cleared.`);
          triggerModCmdCooldown();
        }
        else if(args[0] == "next") {

          let previous = global.songQueue.shift();
          
          if(previous != null && previous.song != null) {
            global.requestHistory.push(previous.song);

            recordStatForRequest(previous);
          }

          if(global.songQueue.length > 0) {
            let next = global.songQueue[0];
            if(next && next.song && next.user) {
              message(`The next song is "${next.song}", requested by @${next.user.name}`);
            }
          } else {
            if(global.queueDisabled) {
              message(`There are no more songs in the queue.`);
            } else {
              message(`There are no songs in the queue. Request one!`);
            }           
          }
          triggerModCmdCooldown();
        } else if(args[0] == "undo") {
          message(`Undoing previous action to the queue.`);
          undoLastAction();
          triggerModCmdCooldown();
        }
        else if(args[0] == "disable" || args[0] == "off" || args[0] == "stop") {
          global.queueDisabled = true;
          message(`The queue has been disabled.`);
        }
        else if(args[0] == "enable" || args[0] == "on" || args[0] == "start") {
          global.queueDisabled = false;
          message(`The queue has been enabled.`);
        }
        else if(args[0] == "freerequests") {
          global.queueFreeRequests = !(global.queueFreeRequests === true);
          message(`Free requests ${ global.queueFreeRequests === true ? 'enabled' : 'disabled'}.`);
        } 
        else if(args[0] == "status") {
          message(`Enabled: ${global.queueDisabled === true ? 'No' : 'Yes'} | Free Requests: ${global.queueFreeRequests === true ? 'Yes': 'No'}`, user.name);
        }  
        else if(args[0] == "topsongs") {
          let alltimeStats = global.sqStats.alltime.songs;

          var items = Object.keys(alltimeStats).map(function(key) {
            return [key, alltimeStats[key]];
          });
          
          // Sort the array based on the second element
          items.sort(function(first, second) {
            return second[1] - first[1];
          });
          
          // Create a new array with only the first 5 items
          let top5 = items.slice(0, 5);

          let top5Formatted = top5.map(kvp => `${kvp[0]} [${kvp[1]}]`).join(", ");

          message(`All Time Top 5 Songs: ${top5Formatted}`);
          
        }      
      }
      else if (args.length > 1) {

        if(global.modModifyCmdsOnCooldown) {
          chatModule.deleteChat(messageId);
          message(`Mod commands on cooldown for a couple seconds to prevent duplicate actions.`, user.name);
          resolve(response);
          return;
        }

        if(args[0] == "add" || args[0] == "current" || args[0] == "addfor" || args[0] == "currentfor") {

          if(global.songQueue.length > queueLength) {
            chatModule.deleteChat(messageId);
            message(`Sorry, the song queue is currently full. Please clear a song first then do this command again.`, user.name);
  
            resolve(response);
            return;
          }

          let userName, songName;
          if(args[0] == "addfor" || args[0] == "currentfor") {
            userName = command.args[1].replace("@", "");
            songName = args.slice(2, args.length).join(" ");
          } else {
            userName = user.name;
            songName = args.slice(1, args.length).join(" ");
          }

          // add new song
          songName = capitalize(songName);
          let request = { 
            song: songName, 
            user: { 
              name: userName, 
              sub: true,
              spentRequest: false, 
              timestamp: Date.now()
             }
           };

           if(args[0] == "add" || args[0] == "addfor") {
            global.songQueue.push(request);
            message(`"${songName}" has been added.`);
           } else {
            global.songQueue.unshift(request);
            message(`"${songName}" has been added as the current song.`);
           }

          triggerModCmdCooldown();
        }
        else if(args[0] == "set") {
          if(args.length < 3) {
            chatModule.deleteChat(messageId);
            message(`Invalid set command usage. ${command.trigger} set [# or 'current'] [song name]`, user.name);
            resolve(response);
            return;
          }

          let index = getQueueIndex(args[1]);

          if(index == null) {
            chatModule.deleteChat(messageId);
            message(`Invalid set command usage. ${command.trigger} set [# or 'current'] [song name]`, user.name);
            resolve(response);
            return;
          }

          if(index > global.songQueue.length-1 || index < 0) {
            chatModule.deleteChat(messageId);
            message(`Invalid set command usage. No song exists at index '${args[1]}'`, user.name);
            resolve(response);
            return;
          }

          let songName = args.slice(2, args.length).join(" ");
          // add new song
          songName = capitalize(songName);
          let request = { 
            song: songName, 
            user: { 
              name: runRequest.user.name, 
              sub: true, 
              timestamp: Date.now()
             }
           };

           global.songQueue[index] = request;
           if(index != 0) {
            message(`Song at position ${index} set to ${request.song}`);
           } else {
            message(`Current song set to ${request.song}`);
           }

           triggerModCmdCooldown();
        }
        else if(args[0] == "rename") {
          if(args.length < 3) {
            chatModule.deleteChat(messageId);
            message(`Invalid rename command usage. ${command.trigger} rename [# or 'current'] [song name]`, user.name);
            resolve(response);
            return;
          }

          let index = getQueueIndex(args[1]);

          if(index == null) {
            chatModule.deleteChat(messageId);
            message(`Invalid rename command usage. ${command.trigger} rename [# or 'current'] [song name]`, user.name);
            resolve(response);
            return;
          }

          if(index > global.songQueue.length-1 || index < 0) {
            chatModule.deleteChat(messageId);
            message(`Invalid rename command usage. ${command.trigger} rename [# or 'current'] [song name]`, user.name);
            resolve(response);
            return;
          }

          let songName = command.args.slice(2, args.length).join(" ");

          let request = global.songQueue[index];
          if(!request) {
            message(`Invalid rename command usage. ${command.trigger} rename [# or 'current'] [song name]`, user.name);
            return resolve(response);
          }

          request.song = songName;
          if(index != 0) {
          message(`Song at position ${index} renamed to ${songName}`);
          } else {
          message(`Current song renamed to ${songName}`);
          }

          triggerModCmdCooldown();
        }
        else if(args[0] == "renameviewer") {
          if(args.length < 3) {
            chatModule.deleteChat(messageId);
            message(`Invalid renameviewer command usage. ${command.trigger} renameviewer [# or 'current'] @viewername`, user.name);
            resolve(response);
            return;
          }

          let index = getQueueIndex(args[1]);

          if(index == null) {
            chatModule.deleteChat(messageId);
            message(`Invalid renameviewer command usage. ${command.trigger} renameviewer [# or 'current'] @viewername`, user.name);
            resolve(response);
            return;
          }

          if(index > global.songQueue.length-1 || index < 0) {
            chatModule.deleteChat(messageId);
            message(`Invalid renameviewer command usage. ${command.trigger} renameviewer [# or 'current'] @viewername`, user.name);
            resolve(response);
            return;
          }

          let veiwer = command.args[2].replace("@", "");

          let request = global.songQueue[index];
          if(!request) {
            message(`Invalid renameviewer command usage. ${command.trigger} renameviewer [# or 'current'] @viewername`, user.name);
            return resolve(response);
          }

          request.user.name = veiwer;
          if(index != 0) {
          message(`Requester for song at position ${index} renamed to ${veiwer}`);
          } else {
          message(`Requester for current song renamed to ${veiwer}`);
          }

          triggerModCmdCooldown();
        }
        else if(args[0] == "remove" || args[0] == "delete") {
          if(args.length < 2) {
            chatModule.deleteChat(messageId);
            message(`Invalid set command usage. ${command.trigger} remove [# or 'current'/@viewername/song name]`, user.name);
            resolve(response);
            return;
          }

          let target = args[1];
          if(target.startsWith("@")) {
            target = target.replace("@", "");
            global.sqCooldowns[target] = undefined;
            global.songQueue.filter(r => r.user.name === target).forEach(r => {
              if(r.user.spentRequest) {
                updateRequestBalance(r.user.name, 1);
              }
            });
            global.songQueue = global.songQueue.filter(r => r.user.name !== target);
            message(`Removed any song requests by the viewer ${target}`, user.name);
          }
          else if(target == "c" || target == "current" || !isNaN(target)) {
            let index = getQueueIndex(target);

            if(index == null || index > global.songQueue.length-1 || index < 0) {
              chatModule.deleteChat(messageId);
              message(`Invalid set command usage. ${command.trigger} remove [# or 'current'/@viewername/song name]`, user.name);
              resolve(response);
              return;
            }

            let oldRequest = global.songQueue[index];

            if(!oldRequest) {
              message(`Invalid set command usage. ${command.trigger} remove [# or 'current'/@viewername/song name]`, user.name);
              return resolve(response);
            }

            global.sqCooldowns[oldRequest.user.name] = undefined;

            if(oldRequest.user.spentRequest) {
              updateRequestBalance(oldRequest.user.name, 1);
            }

            global.songQueue.splice(index, 1);
            message(`Removed song at position: ${index}`, user.name);

            triggerModCmdCooldown();
          } else {
            let songName = args.slice(1, args.length).join(" ");

            global.songQueue.filter(r => r.song.toLowerCase() === songName.toLowerCase()).forEach(r => {
              global.sqCooldowns[r.user.name] = undefined;
            });

            global.songQueue = global.songQueue.filter(r => r.song.toLowerCase() !== songName.toLowerCase());

            message(`Removing songs wth the name: ${songName}`, user.name);
            triggerModCmdCooldown();
          }          
        } 
        else if(args[0] == "move") {
          if(args.length > 3 || getQueueIndex(args[1]) == null || getQueueIndex(args[2]) == null)   {
            chatModule.deleteChat(messageId);
            message(`Invalid set command usage. ${command.trigger} move [# or 'current'] [# or 'current']`, user.name);
            resolve(response);
            return;
          }

          let indexFrom = getQueueIndex(args[1]),
              indexTo = getQueueIndex(args[2]);

          if(indexFrom < 0 || indexTo < 0 || indexFrom > global.songQueue.length-1 || indexTo > global.songQueue.length-1) {
            chatModule.deleteChat(messageId);
            message(`Invalid set command usage. ${command.trigger} move [# or 'current'] [# or 'current']`, user.name);
            resolve(response);
            return;
          }

          let request = global.songQueue[indexFrom];
          global.songQueue.splice(indexFrom, 1);
          global.songQueue.splice(indexTo, 0, request);

          message(`Removed song at position ${indexFrom} to position ${indexTo}`, user.name);

          triggerModCmdCooldown();
        } 
        else if(args[0] == "clearcd" || args[0] == "removecd" ) {
          if(args[1] == null) {
            chatModule.deleteChat(messageId);
            message(`Invalid set command usage. ${command.trigger} clearcd @viewername`, user.name);
            resolve(response);
            return;
          }
          let target = command.args[1].replace("@", "");
          global.sqCooldowns[target] = undefined;
          message(`Cleared any queue cooldowns for the viewer ${target}`, user.name);
        }
        else if(args[0] == "requests" || args[0] == "request" || args[0] == "tokens" || args[0] == "token") {
          if(args[1] == null) {
            chatModule.deleteChat(messageId);
            message(`Invalid request command usage. ${command.trigger} ${args[0]} [@viewername]`, user.name);
            resolve(response);
            return;
          }
          let target = command.args[1].replace("@", "");
          let balance = getRequestBalance(target);
          message(`${target} has ${balance} request(s).`, user.name);
        }
        else if(args[0] == "giverequest" || args[0] == "give" || args[0] == "takerequest" || args[0] == "take") {
          if(args.length < 2) {
            chatModule.deleteChat(messageId);
            message(`Invalid ${args[0]} command usage. ${command.trigger} ${args[0]} @viewername [#]`, user.name);
            resolve(response);
            return;
          }
          let target = command.args[1].replace("@", "");
          
          let giving = args[0] == "giverequest" || args[0] == "give";
          let amount = isNaN(args[2]) ? 1 : parseInt(args[2]);

          let balance = getRequestBalance(target);
          let newBalance = giving ? balance + amount : balance - amount;
          let updatedBal = updateRequestBalance(target, newBalance, true);

          message(`Updated ${target}'s requests. They now have ${updatedBal} request(s).`, user.name);

          let requestCmd = global.sqViewerTrigger || "!ss";

          if(giving) {
            message(`You have been given ${amount} song request(s). You now have ${updatedBal} total request(s). Use one by typing "${requestCmd} Song Title". See a list of available songs by typing !list <3`, target);
          } else {
            message(`${amount} song request(s) have been deducted from you. You now have ${updatedBal} total request(s).`, target);
          }
          
        }
        else {
          message(`Unrecongized mod command.`, user.name);
        }
      } 
      chatModule.deleteChat(messageId);

      global.songQueue = global.songQueue.filter((request, index) => {
        return request != null || (request == null && index == 0);
      });
    }

    /**
     * 
     * 
     * SAVE AND RENDER QUEUE TXT FILE
     * 
     * 
     */

    // update cache save (for redudancy)
    cacheDb.push("/requestqueue", global.songQueue);
    cacheDb.push("/cooldowns", global.sqCooldowns);
    cacheDb.push("/disabled", global.queueDisabled);
    cacheDb.push("/freerequests", global.queueFreeRequests);

    // rerender queue for txt file
    let fileData = "";
    let counter = 0;
    for(let request of global.songQueue) {
      let songAndViewer;
      if(!request) {
        songAndViewer = "";
      } else {
        songAndViewer = `${request.song} (${request.user.name}${request.user.sub ? '*' : ''})`;
      }
      if(counter === 0) {
        fileData += `Current:\r\n${songAndViewer}`;
        if(global.songQueue.length > 1) {
          fileData += "\r\n\r\nNext Up:";
        }
      } else {
        fileData += "\r\n";
        fileData += `${counter}) ${songAndViewer}`;
      }
      counter++;
    }
    if(global.songQueue.length < 1) {
      fileData = runRequest.parameters.emptyQueueText
        .replace(/\\n/gm, "\n");
    }
    fs.writeFileSync(songListTxtPath, fileData, 'utf8');

    resolve(response);
  });
}
exports.run = run;

/**
 * Helpers
 */

function getQueueIndex(input) {
  input = input.toLowerCase();
  if(input == "c" || input == "current") {
    return 0;
  }
  if(!isNaN(input)) {
    return parseInt(input);
  }
  return null;
}

function songAlreadyAdded(song) {
  return songIsInList(global.songQueue.map(s => s.song), song);
}

function songIsInList(list, song, leniency = 2) {
  let inList = false;
  song = dedupe(song.toLowerCase()).replace(/\_/g, " ").replace(/\-/g, " ");
  list.forEach(s => {
    s = s.toLowerCase().replace(/_/g, " ").replace(/-/g, " ");
    let distance = global.Levenshtein.get(s.toLowerCase(), song);
    if(song.startsWith(s) || distance <= leniency) {
      inList = true;
    }
  })
  return inList;
}
var test = [];

function capitalize(string) {
  if(string == null) return "";
  return string.replace( /(^|\s)([a-z])/g , function(m,p1,p2){ return p1+p2.toUpperCase(); } );
}

//reduces repeating duplicate characters in a string. ie aaabbbccc -> abc
function dedupe(str) {
  if(str == null) return "";
  return str.split('').filter(function(e, i, arr) {
    return arr[i+1] !== e;
  }).join('');
}

/**
 * Levenshtein Distance Implementation
 */
function setLevenshtein() {
  var collator;
  try {
    collator = (typeof Intl !== "undefined" && typeof Intl.Collator !== "undefined") ? Intl.Collator("generic", { sensitivity: "base" }) : null;
  } catch (err){
    console.log("Collator could not be initialized and wouldn't be used");
  }
  // arrays to re-use
  var prevRow = [],
    str2Char = [];
  
  /**
   * Based on the algorithm at http://en.wikipedia.org/wiki/Levenshtein_distance.
   */
  var Levenshtein = {
    /**
     * Calculate levenshtein distance of the two strings.
     *
     * @param str1 String the first string.
     * @param str2 String the second string.
     * @param [options] Additional options.
     * @param [options.useCollator] Use `Intl.Collator` for locale-sensitive string comparison.
     * @return Integer the levenshtein distance (0 and above).
     */
    get: function(str1, str2, options) {
      var useCollator = (options && collator && options.useCollator);
      
      var str1Len = str1.length,
        str2Len = str2.length;
      
      // base cases
      if (str1Len === 0) return str2Len;
      if (str2Len === 0) return str1Len;

      // two rows
      var curCol, nextCol, i, j, tmp;

      // initialise previous row
      for (i=0; i<str2Len; ++i) {
        prevRow[i] = i;
        str2Char[i] = str2.charCodeAt(i);
      }
      prevRow[str2Len] = str2Len;

      var strCmp;
      if (useCollator) {
        // calculate current row distance from previous row using collator
        for (i = 0; i < str1Len; ++i) {
          nextCol = i + 1;

          for (j = 0; j < str2Len; ++j) {
            curCol = nextCol;

            // substution
            strCmp = 0 === collator.compare(str1.charAt(i), String.fromCharCode(str2Char[j]));

            nextCol = prevRow[j] + (strCmp ? 0 : 1);

            // insertion
            tmp = curCol + 1;
            if (nextCol > tmp) {
              nextCol = tmp;
            }
            // deletion
            tmp = prevRow[j + 1] + 1;
            if (nextCol > tmp) {
              nextCol = tmp;
            }

            // copy current col value into previous (in preparation for next iteration)
            prevRow[j] = curCol;
          }

          // copy last col value into previous (in preparation for next iteration)
          prevRow[j] = nextCol;
        }
      }
      else {
        // calculate current row distance from previous row without collator
        for (i = 0; i < str1Len; ++i) {
          nextCol = i + 1;

          for (j = 0; j < str2Len; ++j) {
            curCol = nextCol;

            // substution
            strCmp = str1.charCodeAt(i) === str2Char[j];

            nextCol = prevRow[j] + (strCmp ? 0 : 1);

            // insertion
            tmp = curCol + 1;
            if (nextCol > tmp) {
              nextCol = tmp;
            }
            // deletion
            tmp = prevRow[j + 1] + 1;
            if (nextCol > tmp) {
              nextCol = tmp;
            }

            // copy current col value into previous (in preparation for next iteration)
            prevRow[j] = curCol;
          }

          // copy last col value into previous (in preparation for next iteration)
          prevRow[j] = nextCol;
        }
      }
      return nextCol;
    }

  };

  global.Levenshtein = Levenshtein;
} 