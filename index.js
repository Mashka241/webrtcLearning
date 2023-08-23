(async () => {
    const constraints = { video: { width: 360, height: 640 } };
    const localStream = await navigator.mediaDevices.getUserMedia(constraints);
    const localVideo = document.createElement('video');
    localVideo.setAttribute('id', 'localVideo');
    localVideo.setAttribute('autoplay', true);
    localVideo.srcObject = localStream;
    const body = document.body;
    body.appendChild(localVideo);

    // const devices = await getConnectedDevices(); // ?????

    // async function getConnectedDevices() {
    //     const devices = await navigator.mediaDevices.enumerateDevices();
    //     return devices;
    // }

    const configuration = {};
    const peerConnection1 = new RTCPeerConnection(configuration);
    const peerConnection2 = new RTCPeerConnection(configuration);

    localStream.getTracks().forEach(track => peerConnection1.addTrack(track, localStream));
    console.log('peerConnection1 tracks added', peerConnection1);

    const offerOptions = {
        offerToReceiveAudio: 1,
        offerToReceiveVideo: 1
    };
    const offer = await peerConnection1.createOffer(offerOptions);
    console.log('offer sdp', offer.sdp);

    await peerConnection1.setLocalDescription(offer);
    await peerConnection2.setRemoteDescription(offer);

    const answer = await peerConnection2.createAnswer();
    console.log('answer sdp', answer.sdp);

    await peerConnection2.setLocalDescription(answer);
    await peerConnection1.setRemoteDescription(answer);
})()