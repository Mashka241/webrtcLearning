// import firebase from "firebase/compat/app";

class FirebaseSignaling {
    _roomRef;
    _roomId;
    _offer;
    _offerRef;
    _answerRef;

    db;
    get roomId() {
        return this._roomId;
    }

    get roomRef() {
        return this._roomRef;
    }

    set roomRef(value) {
        this._roomRef = value;
    }

    constructor() {
        this.db = firebase.firestore();
        if (location.hostname === "localhost") {
            this.db.useEmulator("127.0.0.1", 8775);
        }
    }

    async createRoom() {
        this._roomRef = await this.db.collection('rooms').doc();
        this._roomId = this._roomRef.id;
        this._offerRef = this._roomRef.collection('signaling').doc('offer');
        this._answerRef = this._roomRef.collection('signaling').doc('answer');
        await this._roomRef.set({
            date: Date.now()
        });
        return this._roomId;
    }

    async isRoom(roomId) {
        const room = this.db.collection('rooms').doc(`${roomId}`);
        const roomSnapshot = await room.get();
        return roomSnapshot.exists;
    }

    joinRoomById(roomId) {
        this._roomId = roomId;
        this._roomRef = this.db.collection('rooms').doc(`${roomId}`);

        this._offerRef = this._roomRef.collection('signaling').doc('offer');
        this._answerRef = this._roomRef.collection('signaling').doc('answer');
    }

    async setOffer(offer) {
        this._offerRef.set({
            type: offer.type,
            sdp: offer.sdp
        });
    }

    async getOffer() {
        return this._offerRef.get().then(doc => doc.data());
    }

    subscribeOnOffer(cb) {
        this._offerRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (data) {
                cb();
            }
        });
    }

    async setAnswer(answer) {
        this._answerRef.set({
            type: answer.type,
            sdp: answer.sdp
        });
    }

    subscribeOnAnswer(cb) {
        this._answerRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (data) {
                cb(new RTCSessionDescription(data));
            }
        });
    }

    createCandidatesCollection(name) {
        return this._roomRef.collection(name);
    }

    onCandidatesAdded(name, cb) {
        this._roomRef.collection(name).onSnapshot(snapshot => {
            snapshot.docChanges().forEach(async change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    cb(new RTCIceCandidate(data));
                }
            });
        });
    }
}