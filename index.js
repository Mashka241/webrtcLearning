(async () => {
    const constraints = { video: { width: 360, height: 640 } };
    const localStream = await navigator.mediaDevices.getUserMedia(constraints);
    window.localMediaStream = localStream;
    const localVideo = document.createElement('video');
    localVideo.setAttribute('id', 'localVideo');
    localVideo.setAttribute('autoplay', true);
    localVideo.srcObject = localStream;
    const body = document.body;
    body.appendChild(localVideo);

    const remoteVideo = document.createElement('video');
    remoteVideo.setAttribute('id', 'remoteVideo');
    remoteVideo.setAttribute('autoplay', true);
    body.appendChild(remoteVideo);

    // const devices = await getConnectedDevices();

    // async function getConnectedDevices() {
    //     const devices = await navigator.mediaDevices.enumerateDevices();
    //     return devices;
    // }

    async function handleCandidate(candidate) {
        if (candidate.candidate) {
            peerConnection.addIceCandidate(candidate);
        } else {
            peerConnection.addIceCandidate(null);
        }
    }

    async function handleOffer(offer) {
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        bc.postMessage({
            type: answer.type,
            sdp: answer.sdp
        })
        await peerConnection.setLocalDescription(answer);
    }

    async function handleAnswer(answer) {
        await peerConnection.setRemoteDescription(answer);
    }

    const bc = new BroadcastChannel("test_channel");
    bc.addEventListener('message', (event) => {
        if (event.data.type === 'candidate') {
            handleCandidate(event.data);
        } else {
            event.data.type === 'offer' ? handleOffer(event.data) : handleAnswer(event.data);
        }
    });

    const configuration = {};
    const peerConnection = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.addEventListener('icecandidate', (e) => {
        console.log('peerConnection', e)
        const message = {
            type: 'candidate',
            candidate: null,
        };
        if (e.candidate) {
            message.candidate = e.candidate.candidate;
            message.sdpMid = e.candidate.sdpMid;
            message.sdpMLineIndex = e.candidate.sdpMLineIndex;
        };

        bc.postMessage(message);
    });

    peerConnection.addEventListener('track', (event) => {
        const mediaStream = event.streams[0];
        window.remoteMediaStream = mediaStream;
        remoteVideo.srcObject = mediaStream;
    });

    const offerOptions = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
    };
    const offer = await peerConnection.createOffer(offerOptions);
    console.log('offer', offer);
    bc.postMessage({
        type: offer.type,
        sdp: offer.sdp
    });
    await peerConnection.setLocalDescription(offer);
})()