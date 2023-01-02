module.exports = function(RED) {
	const ws = require("ws");
	const inspect = require("util").inspect;
    RED.nodes.registerType("yeelightsock",YeelighSockNode);
	function yeelightsockNode(config) {
		RED.nodes.createNode(this,config);
		this.yeeLights = {};
        var node = this;
		node.on('close', ()=> {
			node.warn("[YeelighSockNode][info] Closing " + Object.values(node.yeeLights).length + " Servers");
			Object.keys(node.yeeLights).forEach( (wss) => {
				if (node.yeeLights[wss].server) {
					node.yeeLights[wss].server.close(3001, "Node-red closing");
				}
			});
		});
        node.on('input', (msg) => {
			if (msg.payload == "connect" || msg.payload == "disconnect" || msg.payload == "clear" || msg.payload == "status") {
				if ( msg.payload != "clear" && msg.payload != "status" && (!msg.url) ) {
					node.error("[websock] connect or disconnect must supply msg.url ");
					node.status({fill: "red", shape: "ring", text: "Msg.url not valid"});
					return null;
				}
				if (msg.payload == "status") {
					node.warn("YeelighSockNode][info][status] " + Object.values(node.yeeLights).length + " Servers");
					Object.keys(node.yeeLights).forEach( (wss) => {
						node.warn("YeelighSockNode][info][status] " + wss + " " + node.yeeLights[wss].topic);
					});
					return null;
				}
				if (msg.payload == "clear") {
					node.warn("[YeelighSockNode][info][clear] Clearing " + Object.values(node.yeeLights).length + " Servers");
					Object.keys(node.yeeLights).forEach( (wss) => {
						node.warn("[YeelighSockNode][info][clear] Closing " + node.yeeLights[wss].url);
						node.yeeLights[wss].server.close(3002, "User Cleared servers");
						node.yeeLights[wss] = {}; 
					});
					node.status({fill: "yellow", shape: "ring", text: "Cleared " + msg.url})
					return null;
				}
				if (msg.payload == "disconnect") {
					if (!node.yeeLights[msg.url]) {
						node.warn("[YeelighSockNode][info][disconnect] Server " + msg.url + " Not opened ");
						return null;
					}
					if (!node.yeeLights[msg.url].server) {
						node.warn("[YeelighSockNode][debug][disconnect] Closing Server " + msg.url);
						node.yeeLights[msg.url].server.close(3003, "User Disconnected Server");
						node.status({fill: "blue", shape: "ring", text: "disconnecting "});
					} else {
						node.warn("[YeelighSockNode][debug][disconnect]  Server already closed " + msg.url);
						node.status({fill: "yellow", shape: "ring", text: "Disconnected "});
					}
					node.yeeLights[msg.url] = null;
					return null;
				}
				if (node.yeeLights[msg.url]) {
					node.warn("[YeelighSockNode][info] Server " + msg.url + " already connected will close and reconnect");
					node.yeeLights[msg.url].server.close(3004, "Re-opening Server");
					node.warn("[YeelighSockNode][debug][connect]  Re Opening " + msg.url);
				} else {
					node.warn("[YeelighSockNode][debug][connect]  Opening " + msg.url);
					node.yeeLights[msg.url] = {};
				}
				node.yeeLights[msg.url].server = new ws.WebSocket(msg.url);
				node.yeeLights[msg.url].topic = msg.topic;
				node.yeeLights[msg.url].url = msg.url;
				node.yeeLights[msg.url].onMessage = function(url, data) {
						let tdata = null;
						try {
							tdata = JSON.parse(data);
						} catch (err) {
							tdata = data + "";
							node.warn(["mesg NOT parsed " + err, err, tdata, data,msg]);
						}
						node.send({topic: node.yeeLights[url].topic, url: node.yeeLights[url].url, payload: tdata});
					};
				node.yeeLights[msg.url].onClose = function(url, ev) {
						node.warn(["Close Event Received url=" + url, ev]);
						node.send({topic: node.yeeLights[url].topic + "/close", url: node.yeeLights[url].url, payload: ev});
					};
				node.status({fill: "blue", shape: "ring", text: "connecting to " + msg.url})
				node.yeeLights[msg.url].server.on("open", () => {
					node.status({fill: "green", shape: "dot", text: "connected:" + msg.url});
				});
				node.yeeLights[msg.url].server.on("error", data => {
					node.status({fill: "red", shape: "ring", text: "error:" + msg.url + " " + data});
					
				});
				node.yeeLights[msg.url].server.on("close", (ev) => {
					node.status({fill: "yellow", shape: "ring", text: "closed:"  + msg.url + " " + ev.reason});
					node.yeeLights[msg.url].onClose(msg.url, ev);
				});
				node.yeeLights[msg.url].server.on("message", data => {
					node.yeeLights[msg.url].onMessage(msg.url, data);
				});
				return null;
			} else {
				node.error("[websock] Payload must be connect|disconnect||clear was  " + msg.payload);
				node.status({fill: "red", shape: "ring", text: "Unknown payload " + msg.payload});
				return null;
			}
        });
    }
    RED.nodes.registerType("yeelightsock",YeelighSockNode);
}