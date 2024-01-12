// import firebase from "firebase/compat/app";

class FirebaseSignaling {
    _roomRef;
    _roomId;
    _offer;

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
    }

    async setOffer(offer) {
        await this._roomRef.update({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        });
    }

    async getOffer() {
        const roomSnapshot = await this._roomRef.get();
        return roomSnapshot.data().offer;
    }

    subscribeOnOffer(cb) {
        this._roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (data && data.offer) {
                cb();
            }
        });
    }

    async setAnswer(answer) {
        await this._roomRef.update({ // update some fields, without overwriting the entire document
            answer: {
                type: answer.type,
                sdp: answer.sdp,
            }
        });
    }

    subscribeOnAnswer(cb) {
        this._roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();
            if (data && data.answer) {
                cb(new RTCSessionDescription(data.answer));
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