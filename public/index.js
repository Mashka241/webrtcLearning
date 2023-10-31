(async () => {
    // firebase
    let roomRef;
    let roomId;
    const createRoomButton = document.querySelector("button#createRoom");
    const roomIdInput = document.querySelector('input#roomId');

    // call elements
    const startCallButton = document.querySelector('button#call');
    const answerButton = document.querySelector('button#answer');
    const hungUpButton = document.querySelector('button#hungup');
    const callButtons = document.querySelector('#callcontrols');
    const toggleVideoButton = document.querySelector('button#videotoggle');
    const remoteVideo = document.querySelector('video#remoteVideo');
    const localVideo = document.querySelector('video#localVideo');

    // chat elements
    const openChatButton = document.querySelector('button#openChat');
    const chat = document.querySelector('.chat');
    const messages = document.querySelector('#messages');
    const messageBox = document.querySelector('#message');
    const sendMessageButton = document.querySelector('button#sendMessage');

    let localStream;
    let peerConnection;
    let statsGathererInterval;
    let dataChannel;

    let isVideoOn = false;

    answerButton.disabled = true;
    hungUpButton.disabled = true;
    startCallButton.addEventListener('click', startCall);
    answerButton.addEventListener('click', answerCall);
    hungUpButton.addEventListener('click', hungUp);
    toggleVideoButton.addEventListener('click', toggleVideo);
    openChatButton.addEventListener('click', openChat);
    sendMessageButton.addEventListener('click', sendMessage);

    createRoomButton.addEventListener('click', createRoom);
    roomIdInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            joinRoomById();
        }
    });

    async function createRoom() {
        const db = firebase.firestore();
        roomRef = await db.collection('rooms').doc();
        roomId = roomRef.id;

        showCallScreen(roomId);
        subscribeOnOffer();
    }

    async function joinRoomById() {
        const roomId = roomIdInput.value;
        const db = firebase.firestore();
        roomRef = db.collection('rooms').doc(`${roomId}`); // reference
        // const roomSnapshot = await roomRef.get(); // content
        // if (roomSnapshot.exists) {
        showCallScreen(roomId);
        subscribeOnOffer();
        // }
    }

    function subscribeOnOffer() {
        roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (data && data.offer) {
                answerButton.disabled = false;
                answerButton.classList.add('calling');
            }
        });
    }

    function showCallScreen(roomId) {
        const roomIdEl = document.querySelector('.room-id');
        const roomIdSpan = document.createElement('span');
        roomIdSpan.appendChild(document.createTextNode(roomId));
        roomIdEl.appendChild(roomIdSpan);
        roomIdEl.classList.remove('invisible');

        const startScreen = document.querySelector('.start-screen');
        startScreen.classList.add('invisible');

        const callScreen = document.querySelector('.call-screen');
        callScreen.classList.remove('invisible');
    }

    async function createLocalStream() {
        const constraints = { video: true, audio: false };
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        localVideo.srcObject = localStream;
        window.localMediaStream = localStream;
        console.log('local stream created');
    }

    async function startCall() {
        console.log('start call');
        if (peerConnection) {
            console.log('call already started');
            return;
        }

        const callerCandidatesCollection = roomRef.collection('callerCandidates');

        roomRef.collection('calleeCandidates').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    handleCandidate(new RTCIceCandidate(data));
                }
            });
        });

        await createLocalStream();

        createPeerConnection(callerCandidatesCollection);

        await createOffer();

        roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (!peerConnection.currentRemoteDescription && data && data.answer) {
                handleAnswer(new RTCSessionDescription(data.answer));
            }
        });

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

        console.log('offer', offer.sdp);
        await roomRef.set({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });

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

    function createPeerConnection(candidatesCollection) {
        console.log('createPeerConnection');
        const configuration = {};
        peerConnection = new RTCPeerConnection(configuration);
        peerConnection.addEventListener('icecandidate', (e) => {
            // const message = {
            //     type: 'candidate',
            //     candidate: null,
            // };
            // if (e.candidate) {
            //     message.candidate = e.candidate.candidate;
            //     message.sdpMid = e.candidate.sdpMid;
            //     message.sdpMLineIndex = e.candidate.sdpMLineIndex;
            // };
            if (!e.candidate) {
                return;
            }
            candidatesCollection.add(e.candidate.toJSON());
            // bc.postMessage(message);
        });

        peerConnection.addEventListener('track', (event) => {
            const mediaStream = event.streams[0];
            // mediaStream.getTracks().forEach(track => {
            //     remoteStream.addTrack(track)
            // });
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
        const calleeCandidatesCollection = roomRef.collection('calleeCandidates');
        createPeerConnection(calleeCandidatesCollection);

        const offer = roomSnapshot.data().offer;
        handleOffer(offer);

        roomRef.collection('callerCandidates').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    let data = change.doc.data();
                    handleCandidate(new RTCIceCandidate(data));
                }
            });
        });

        hungUpButton.disabled = false;
        hungUpButton.classList.add('hungup');
        startCallButton.disabled = true;
    }

    async function handleOffer(offer) {
        console.log('handle offer');
        if (!peerConnection) {
            createPeerConnection(); // when offer comes from chat button
        }
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();

        const roomWithAnswer = {
            answer: {
                type: answer.type,
                sdp: answer.sdp,
            },
        };
        await roomRef.update(roomWithAnswer);

        await peerConnection.setLocalDescription(answer);
    }

    async function handleAnswer(answer) {
        console.log('answer', answer);
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
})()