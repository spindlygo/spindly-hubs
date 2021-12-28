let { writable } = require('svelte/store');

exports.ConnectHub = function ConnectHub(hubclass, hub_instance_id) {
    let hub = {};

    if (!hub_instance_id) {
        // Asign a unique id to hub_instance_id
        hub_instance_id = hubclass + '_' + Date.now() + Math.random().toString(36).substr(2, 9);
    }

    hub.hubclass = hubclass;
    hub.hub_instance_id = hub_instance_id;
    hub.stores = {};
    hub.buffer = {};

    const host_protocol = (("https:" == document.location.protocol) ? "wss://" : "ws://");
    const wsurl = host_protocol + document.location.host + "/spindly/ws/" + hubclass + "/" + hub_instance_id;

    hub.send = function (key, value) { }

    let StoreChanged = function (store_name, store_value) {
        hub.send(store_name, store_value);
    }


    function connectWS() {
        try {
            let socket = new WebSocket(wsurl);

            socket.onopen = () => {
                console.log("Connected to Hub instance " + hubclass + "/" + hub_instance_id);

                for (const key in hub.buffer) {
                    if (Object.hasOwnProperty.call(hub.buffer, key)) {
                        const value = hub.buffer[key];
                        hub.send(key, value);
                    }
                }
                hub.buffer = {};
            };

            socket.onmessage = (event) => {
                console.log("Recieved : ", hub_instance_id, " : ", event.data);
                let data = JSON.parse(event.data);

                for (let store_name in data) {
                    if (data.hasOwnProperty(store_name)) {
                        hub.stores[store_name]._internal_set(data[store_name]);
                    }
                }


            }

            socket.onclose = event => {
                console.log("Hub closed connection: ", event);
                setTimeout(connectWS, 500);
            };

            socket.onerror = error => {
                console.log("Hub connection error: ", error);
            };

            hub.send = function (key, value) {
                if (socket.readyState == WebSocket.OPEN) {
                    socket.send(JSON.stringify({ [key]: value }));
                } else {
                    hub.buffer[key] = value;
                }
            }


        } catch (error) {
            console.log(error);
            setTimeout(connectWS, 500);
        }
    }

    connectWS();



    return function SpindlyStore(storename, initialValue = null) {

        const { subscribe, set, update } = writable(initialValue, () => {
            // console.log('got a subscriber');
            return () => {
                // console.log("Cleaning up...");
                delete hub.stores[storename];
            }
        });

        let store = {
            subscribe: subscribe,
            set: newvalue => {
                set(newvalue);
                StoreChanged(storename, newvalue);
            },
            update: update,
            _internal_set: set,
        };

        hub.stores[storename] = store;

        return store;
    }
}
