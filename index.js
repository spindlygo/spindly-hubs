let { writable, readable } = require('svelte/store');

exports.ConnectHub = function ConnectHub(hubclass, hub_instance_id, preserve = false) {
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
                        const store = hub.stores[store_name];
                        if (store && store._internal_set) {
                            store._internal_set(data[store_name]);
                        } else {
                            delete hub.stores[store_name];
                        }
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

    let createdStoreCount = 0;


    return function SpindlyStore(storename, initialValue = null) {

        createdStoreCount++;

        let discard = () => {
            createdStoreCount--;

            if (!preserve) {
                delete hub.stores[storename];
            }

        }

        const { subscribe, set, update } = writable(initialValue, () => {
            // console.log('got a subscriber');
            return () => {
                // console.log("Cleaning up...");
                discard();
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
            discard: discard,
        };

        hub.stores[storename] = store;

        return store;
    }
}

exports.IsHostAlive = readable(true, function start(set) {
    const docLocation = document.location.toString()
    const hostPingAddress = (docLocation.endsWith("/") ? (docLocation) : (docLocation + "/")) + `spindly/alive`

    const interval = setInterval(() => {
        // Ping the server every second

        fetch(hostPingAddress, {
            method: 'GET'
        }).then(response => {
            if (response.status !== 200) {
                console.log('Host is not responding correctly. Status Code: ' +
                    response.status);
                set(false);
                return;
            }

            console.log("Host is alive");
            set(true);

        }).catch(function (err) {
            console.log('Host is malfunctioned', err);
            set(false);

        });



    }, 1000);

    return function stop() {
        clearInterval(interval);
    };
});