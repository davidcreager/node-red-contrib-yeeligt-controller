module.exports = function(RED) {
	const Yeelight = require("./yeelightclasses");
	const inspect = require("util").inspect;
    RED.nodes.registerType("yeelight-controller",YeelightController);
	class YeelightWrapper {
		constructor(tNode, topic, IP, PORT) {
			this.IP = IP;
			this.PORT = PORT || 55443;
			this.offline = true;
			this.topic = topic || "No Topic";
			this.yeeParent = tNode;
			this.yeelight = null;
			this.connect();
		}
		async connect(){
			//console.log("[YeelightWrapper][connect] request to connect")
			if ( this.yeelight && !this.offline ) return true;
			if ( this.yeelight ) this.yeelight.close();
			const tmpYeelight = new Promise( (accept, reject) => {
				this.yeelight = new Yeelight(this.IP, this.Port)
								.on("error", err => reject(err))
								.on("connect", light => {this.yeeParent.onConnect(this.IP, light);accept(light)});
			});
			try {
				await tmpYeelight;
				this.yeelight.on("error", err => { console.log("[YeelightWrapper][onerror] received " + err);this.yeeParent.onError(this.IP, err) } )
				this.yeelight.on("connect", light => { this.offline = false; this.yeeParent.onConnect(this.IP, light) } )
				this.yeelight.on("props", (params, msg) => { this.yeeParent.onProps(this.IP, params, msg) } )
				this.yeelight.on("message", (params, msg) => { this.yeeParent.onMessage(this.IP, params, msg) } )
				this.yeelight.on("disconnect", light => { console.log("[YeelightWrapper][ondisconnect] disconnected ");this.offline = true; this.yeeParent.onDisconnect(this.IP, light) } );
				this.offline = false;
			} catch (er) {
				//this.yeelight = null;
				console.log("[YeelightWrapper][connect] Connecting to " + this.IP + " error caught "  + er); return null;
			}
			return true;
		}
		get connected() { return ( (this.yeelight) ? this.yeelight.connected : false ) }
		close(reason) {
			//console.log("[YeelightWrapper][close] Close call received", reason)
			if (this.yeelight) this.yeelight.close();
		}
		async sendCommand(cmd){
			if ( !this.yeelight || this.offline ) {
				await this.connect();
				if ( !this.yeelight || this.offline ) {
					console.log("[YeelightWrapper][sendCommand] Cannot connect for command " + cmd.cmd + " with value " + cmd.value);
					return null;
				}
			}
			try {
				return await this.yeelight[cmd.cmd](cmd.value);
			} catch (er) {
				console.log(["[YeelightWrapper][sendCommand] caught error for " + cmd.cmd + " with value " + cmd.value, er])
				return null;
			}
		}
	}
	function YeelightController(config) {
		RED.nodes.createNode(this,config);
		this.yeeLights = {};
        var node = this;
		node.status({fill: "blue", shape: "ring", text: "ready"});
		this.onMessage = function(ip, params, msg) {
			node.send({topic: ( node.yeeLights[ip]?.topic || "unknown" ) + "/message", ip: ip, payload: msg});
		}
		this.onError = function(ip, err) {
			console.log("[YeelightController][onError] " + ip + " Received");
			node.status({fill: "red", shape: "ring", text: "error:" + ip + " " + err});
		}
		this.onConnect = function(ip, light) {
			node.status({fill: "green", shape: "dot", text: "connected:" + ip});
			node.send({topic: ( node.yeeLights[ip]?.topic || "unknown" ) + "/status", ip: ip, payload: "online"});
		}
		this.onClose = function(ip, reason) {
			console.log("[YeelightController][onClose] " + ip + " Received");
			node.status({fill: "yellow", shape: "ring", text: "closed:"  + ip + " " + reason});
		}
		this.onProps = function(ip, params, msg) {
			node.send({topic: ( node.yeeLights[ip]?.topic || "unknown" ) + "/props", ip: node.yeeLights[ip].IP, payload: msg});
		}
		this.onDisconnect = function(ip, light) {
			console.log("[YeelightController][onDisconnect] " + ip + " Received");
			node.send({topic: ( node.yeeLights[ip]?.topic || "unknown" ) + "/status", ip: ip, payload: "offline"});
			node.status({fill: "grey", shape: "ring", text: "closed:"  + ip});
		}
		node.on('close', ()=> {
			node.warn("[YeelightController][info] Closing " + Object.values(node.yeeLights).length + " Servers");
			Object.keys(node.yeeLights).forEach( yee => {
				if (node.yeeLights[yee]) {
					node.yeeLights[yee].close(3001, "Node-red closing");
				}
			});
		});
        node.on('input', async (msg) => {
			const validCommands = ["connect", "disconnect", "clear", "status"];
			if ( typeof(msg.payload) == "object" && msg.payload.hasOwnProperty("cmd") ) {
				if (!node.yeeLights[msg.ip]) {
					node.warn("[YeelightController][debug][cmd] " + msg.ip + " not connected, will connect ");
					node.yeeLights[msg.ip] = new YeelightWrapper(node, msg.topic, msg.ip);
				}
				const result = await node.yeeLights[msg.ip].sendCommand(msg.payload);
				node.send({topic: ( node.yeeLights[msg.ip]?.topic || "unknown" ) + "/response", ip: msg.ip, cmd: msg.payload, payload: result});
			} else if ( validCommands.includes(msg.payload) ) {
				if ( (msg.payload == "clear" || msg.payload == "disconnect" || msg.payload == "command") && !msg.ip ) {
					node.error("[YeelightController] connect or disconnect must supply msg.ip ");
					node.status({fill: "red", shape: "ring", text: "Msg.ip not valid"});
					return null;
				}
				if (msg.payload == "status") {
					node.warn("YeelightController][info][status] " + Object.values(node.yeeLights).length + " Servers");
					Object.keys(node.yeeLights).forEach( yee => {
						if (node.yeeLights[yee] != null) {
							node.warn("YeelightController][info][status] " + yee + " " + node.yeeLights[yee].topic + " offline=" + node.yeeLights[yee].offline + " connected=" + node.yeeLights[yee].connected );
						} else {
							node.warn("YeelightController][info][status] " + yee + " is not set up" );
						}
					});
					return null;
				} else if (msg.payload == "clear") {
					node.warn("[YeelightController][info][clear] Clearing " + Object.values(node.yeeLights).length + " Servers");
					Object.keys(node.yeeLights).forEach( (yee) => {
						node.warn("[YeelightController][info][clear] Closing " + node.yeeLights[yee].IP);
						node.yeeLights[yee].close(3002, "User Cleared servers");
						node.yeeLights[yee] = null;
					});
					node.status({fill: "yellow", shape: "ring", text: "Cleared " + msg.ip})
					return null;
				} else 	if (msg.payload == "disconnect") {
					if (node.yeeLights[msg.ip].offline) {
						node.warn("[YeelightController][info][disconnect] Server " + msg.ip + " Not online ");
						return null;
					}
					node.warn("[YeelightController][debug][disconnect] Closing Server " + msg.ip);
					node.yeeLights[msg.ip].close(3003, "User Disconnected Server");
					node.status({fill: "blue", shape: "ring", text: "disconnecting "});
					return null;
				} else if (msg.payload == "connect") {
					if (node.yeeLights[msg.ip]) {
						node.warn("[YeelightController][info] Server " + msg.ip + " already connected will close and reconnect");
						node.yeeLights[msg.ip].close(3004, "Re-opening Server");
						node.warn("[YeelightController][connect]  Re Opening " + msg.ip);
					} else {
						node.warn("[YeelightController][connect]  Opening " + msg.ip);
					}
					try {
						node.yeeLights[msg.ip] = new YeelightWrapper(node, msg.topic, msg.ip);
					} catch (er) {node.error("[YeelightController][connect] Connecting to " + msg.ip + " error caught "  + er); return null;}
					node.status({fill: "blue", shape: "ring", text: "connecting to " + msg.ip})
				}
				return null;
			} else {
				node.error("[websock] Payload must be connect|disconnect||clear was  " + msg.payload);
				node.status({fill: "red", shape: "ring", text: "Unknown payload " + msg.payload});
				return null;
			}
        });
    }
}