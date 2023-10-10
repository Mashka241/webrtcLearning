(async () => {
    const startCallButton = document.querySelector('button#call');
    const answerButton = document.querySelector('button#answer');
    const hungUpButton = document.querySelector('button#hungup');
    const callButtons = document.querySelector('#callcontrols');
    const toggleVideoButton = document.querySelector('button#videotoggle');
    const remoteVideo = document.querySelector('video#remoteVideo');
    const localVideo = document.querySelector('video#localVideo');
    const openChatButton = document.querySelector('button#openChat');
    const chat = document.querySelector('.chat');
    const messages = document.querySelector('#messages');
    const messageBox = document.querySelector('#message');
    const sendMessageButton = document.querySelector('button#sendMessage');

    let roomRef;
    let roomId;
    const roomIdInput = document.querySelector('input#roomId');
    let callerCandidatesCollection;

    let localStream;
    let peerConnection;
    let statsGathererInterval;
    let dataChannel;

    let isVideoOn = false;

    // answerButton.disabled = true;
    hungUpButton.disabled = true;
    startCallButton.addEventListener('click', startCall);
    // answerButton.addEventListener('click', answerCall);
    hungUpButton.addEventListener('click', hungUp);
    toggleVideoButton.addEventListener('click', toggleVideo);
    openChatButton.addEventListener('click', openChat);
    sendMessageButton.addEventListener('click', sendMessage);
    answerButton.addEventListener('click', joinRoomById);

    // const bc = new WebSocketSignaling();
    // bc.addEventListener('message', (event) => {
    //     switch (event.data.type) {
    //         case 'calling':
    //             answerButton.disabled = false;
    //             answerButton.classList.add('calling');
    //             break;
    //         case 'answering':
    //             createOffer();
    //             break;
    //         case 'candidate':
    //             handleCandidate(event.data);
    //             break;
    //         case 'offer':
    //             handleOffer(event.data);
    //             break;
    //         case 'answer':
    //             handleAnswer(event.data);
    //             break;
    //         case 'hungup':
    //             answerButton.disabled = true;
    //             answerButton.classList.remove('calling');
    //             hungUpButton.disabled = true;
    //             hungUpButton.classList.remove('hungup');
    //             startCallButton.disabled = false;
    //             if (peerConnection) {
    //                 hungUp();
    //             }
    //             break;
    //         default:
    //             console.log('default', event.data.type);
    //     }
    // });

    async function createLocalStream() {
        const constraints = { video: false, audio: true };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        window.localMediaStream = localStream;
        console.log('local stream created');
    }

    async function createRoom() {
        const db = firebase.firestore();
        roomRef = await db.collection('rooms').doc();
        callerCandidatesCollection = roomRef.collection('callerCandidates');
    }

    async function startCall() {
        console.log('start call');
        if (peerConnection) {
            console.log('call already started');
            return;
        }

        const db = firebase.firestore();
        roomRef = await db.collection('rooms').doc();
        callerCandidatesCollection = roomRef.collection('callerCandidates');


        roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    let data = change.doc.data();
                    handleCandidate(new RTCIceCandidate(data));
                }
            });
        });

        await createLocalStream();

        createPeerConnection();

        await createOffer();

        roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (!peerConnection.currentRemoteDescription && data && data.answer) {
                handleAnswer(new RTCSessionDescription(data.answer));
            }
        });

        // bc.postMessage({ type: 'calling' });
        hungUpButton.disabled = false;
        hungUpButton.classList.add('hungup');
        startCallButton.disabled = true;

        callButtons.classList.remove('invisible');
    }

    async function createOffer() {
        console.log('create offer');
        const offerOptions = {
            offerToReceiveAudio: 1,
            offerToReceiveVideo: 1
        };
        const offer = await peerConnection.createOffer(offerOptions);
        // bc.postMessage({
        //     type: offer.type,
        //     sdp: offer.sdp
        // });
        console.log('offer', offer.sdp);
        await roomRef.set({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });
        roomId = roomRef.id;
        console.log('roomID', roomId);
        await peerConnection.setLocalDescription(offer);
    }

    function displayRecvVideoStats(report) {
        if (report.mediaType === 'video' && report.type === 'inbound-rtp') {
            console.log(`framesPerSecond: ${report?.framesPerSecond}`);
        }
    }

    async function processStats() {
        if (!peerConnection) { return };
        const stats = await peerConnection.getStats(null);

        stats.forEach(report => {
            displayRecvVideoStats(report);
        });
    }

    function createPeerConnection() {
        console.log('createPeerConnection');
        const configuration = {};
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.addEventListener('icecandidate', (e) => {
            const message = {
                type: 'candidate',
                candidate: null,
            };
            if (e.candidate) {
                message.candidate = e.candidate.candidate;
                message.sdpMid = e.candidate.sdpMid;
                message.sdpMLineIndex = e.candidate.sdpMLineIndex;
            };

            callerCandidatesCollection.add(e.candidate.toJSON());
            // bc.postMessage(message);
        });

        peerConnection.addEventListener('track', (event) => {
            const mediaStream = event.streams[0];
            window.remoteMediaStream = mediaStream;
            remoteVideo.srcObject = mediaStream;
        });

        peerConnection.addEventListener('datachannel', event => {
            console.log('datachannel', event);
            dataChannel = event.channel;
            dataChannel.addEventListener('open', () => {
                console.log('openED dc');
                chat.classList.remove('invisible');
            });
            dataChannel.addEventListener('message', (evt) => {
                console.log('MESSAGE: ', evt.data);
                addMessage('secondTab', evt.data);
            });
        });

        if (localStream) {
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            statsGathererInterval = setInterval(processStats, 1000);
        }

        console.log('connection created', peerConnection);
    }

    async function handleCandidate(candidate) {
        if (candidate.candidate) {
            await peerConnection.addIceCandidate(candidate);
        } else {
            await peerConnection.addIceCandidate(null);
        }
    }

    async function answerCall() {
        console.log('answer call');
        answerButton.disabled = true;
        answerButton.classList.remove('calling');
        callButtons.classList.remove('invisible');

        await createLocalStream();

        createPeerConnection();

        // bc.postMessage({ type: 'answering' });
        hungUpButton.disabled = false;
        hungUpButton.classList.add('hungup');
        startCallButton.disabled = true;
    }

    async function handleOffer(offer) {
        if (!peerConnection) {
            createPeerConnection(); // when offer comes from chat button
        }
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        // bc.postMessage({
        //     type: answer.type,
        //     sdp: answer.sdp
        // })
        await peerConnection.setLocalDescription(answer);

        return answer;
    }

    async function handleAnswer(answer) {
        await peerConnection.setRemoteDescription(answer);
    }

    function hungUp() {
        // bc.postMessage({ type: 'hungup' });

        if (peerConnection) {
            peerConnection.close();
            peerConnection.getStats().then(report => console.log('stats after closing', report));
            peerConnection = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        localVideo.srcObject = null;
        remoteVideo.srcObject = null;

        clearInterval(statsGathererInterval)
    }

    async function toggleVideo() {
        if (isVideoOn) {
            console.log('toggle video OFF');
            // ????
            const videoTracks = stream.getVideoTracks();
            videoTracks.forEach(track => track.stop());
            localStream.removeTrack(videoTracks[0]);
            localVideo.srcObject = null;

            isVideoOn = false;
        } else {
            console.log('toggle video ON');
            const constraints = { video: true, audio: true };
            stream = await navigator.mediaDevices.getUserMedia(constraints);
            const videoTracks = stream.getVideoTracks();
            localStream.addTrack(videoTracks[0]);
            localVideo.srcObject = localStream;

            peerConnection.addTrack(videoTracks[0], localStream);
            createOffer();
            isVideoOn = true;
        }
    }

    async function openChat() {
        console.log('open dc');
        if (!peerConnection) {
            createPeerConnection();
        }

        dataChannel = peerConnection.createDataChannel('dataChannel');
        console.log('create data channel', dataChannel.readyState);

        dataChannel.addEventListener('open', () => {
            console.log('openED dc');
            chat.classList.remove('invisible');
        });

        dataChannel.addEventListener('message', (evt) => {
            console.log('MESSAGE: ', evt.data);
            addMessage('secondTab', evt.data);
        });

        await createOffer();
    }

    function sendMessage() {
        const message = messageBox.value;
        console.log('message', message);
        dataChannel.send(message);
        addMessage('me', message);
        messageBox.value = '';
    }

    function addMessage(sender, text) {
        const messageEl = document.createElement('p');
        const senderEl = document.createElement('span');
        senderEl.appendChild(document.createTextNode(`${sender}: `));
        messageEl.appendChild(senderEl);
        messageEl.appendChild(document.createTextNode(text));
        messages.appendChild(messageEl);
    }

    async function joinRoomById() {
        const roomId = roomIdInput.value;
        const db = firebase.firestore();
        const roomRef = db.collection('rooms').doc(`${roomId}`);
        const roomSnapshot = await roomRef.get();
        if (roomSnapshot.exists) {
            console.log('received offer', roomSnapshot.data().offer);
            createPeerConnection();
            const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
            peerConnection.addEventListener('icecandidate', event => {
                if (!event.candidate) {
                    console.log('Got final candidate!');
                    return;
                }
                console.log('Got candidate: ', event.candidate);
                calleeCandidatesCollection.add(event.candidate.toJSON());
            });


            const offer = roomSnapshot.data().offer;
            const answer = await handleOffer(offer);

            const roomWithAnswer = {
                answer: {
                    type: answer.type,
                    sdp: answer.sdp,
                },
            };
            await roomRef.update(roomWithAnswer);

            roomRef.collection('callerCandidates').onSnapshot(snapshot => {
                snapshot.docChanges().forEach(async change => {
                    if (change.type === 'added') {
                        let data = change.doc.data();
                        handleCandidate(new RTCIceCandidate(data));
                    }
                });
            });
        }
    }
})()