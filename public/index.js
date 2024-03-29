(async () => {
    // firebase
    const createRoomButton = document.querySelector("button#createRoom");
    const roomIdInput = document.querySelector('input#roomId');
    const signaling = new FirebaseSignaling();

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
        const roomId = await signaling.createRoom();
        showCallScreen(roomId);
        signaling.subscribeOnOffer(enableAnswerButton);
    }

    async function joinRoomById() {
        const roomId = roomIdInput.value;
        const isRoom = await signaling.isRoom(roomId);
        if (isRoom) {
            signaling.joinRoomById(roomId);
            showCallScreen(roomId);
            signaling.subscribeOnOffer(enableAnswerButton);
        }
    }

    function enableAnswerButton() {
        answerButton.disabled = false;
        answerButton.classList.add('calling');
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

        const callerCandidatesCollection = signaling.createCandidatesCollection('callerCandidates');
        signaling.onCandidatesAdded('calleeCandidates', handleCandidate);

        await createLocalStream();

        createPeerConnection(callerCandidatesCollection);

        await createOffer();

        signaling.subscribeOnAnswer((answer) => {
            if (!peerConnection.currentRemoteDescription) {
                handleAnswer(answer);
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

        await signaling.setOffer(offer);

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
            if (!e.candidate) {
                return;
            }
            candidatesCollection.add(e.candidate.toJSON());
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

        const calleeCandidatesCollection = signaling.createCandidatesCollection('calleeCandidates');

        createPeerConnection(calleeCandidatesCollection);

        const offer = await signaling.getOffer();
        handleOffer(offer);

        signaling.onCandidatesAdded('callerCandidates', handleCandidate);

        hungUpButton.disabled = false;
        hungUpButton.classList.add('hungup');
        startCallButton.disabled = true;
    }

    async function handleOffer(offer) {
        console.log('handle offer', offer);
        if (!peerConnection) {
            createPeerConnection(); // when offer comes from chat button
        }
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();

        signaling.setAnswer(answer);

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