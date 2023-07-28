(async () => {
    const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 360, height: 640 } });
    window.mediaStream = mediaStream;
    console.log('settings 1', mediaStream.getVideoTracks()[0].getSettings(), mediaStream.getVideoTracks().length);
    const videoEl = document.createElement('video');
    videoEl.srcObject = mediaStream;
    videoEl.setAttribute('autoplay', true);
    const body = document.body;
    body.appendChild(videoEl)

    mediaStream.getVideoTracks()[0].addEventListener('mute', () => { console.log('mute') });
    mediaStream.getVideoTracks()[0].addEventListener('unmute', () => { console.log('unmute') });
    mediaStream.getVideoTracks()[0].addEventListener('ended', () => { console.log('ended') });

    setTimeout(async () => {
        console.log('applyConstraints');
        await mediaStream.getVideoTracks()[0].applyConstraints({ width: 640, height: 360 });
    }, 1000)
})()