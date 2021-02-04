import React from "react";
import { db } from "./store";
import "./App.css";

const styles = {
  layer: {
    background: 'rgb(0,0,0)',
    background: '-moz-linear-gradient(328deg, rgba(0,0,0,1) 81%, rgba(0,77,93,1) 100%)',
    background: '-webkit-linear-gradient(328deg, rgba(0,0,0,1) 81%, rgba(0,77,93,1) 100%)',
    background: 'linear-gradient(328deg, rgba(0,0,0,1) 81%, rgba(0,77,93,1) 100%)',
    filter: 'progid:DXImageTransform.Microsoft.gradient(startColorstr="#000000",endColorstr="#004d5d",GradientType=1)',
    objectFit: 'contain',
  },
  video: {
    display: 'block',
    width: '100%',
    height: '100%',
    borderRadius: 20
  },
  localVideo: {
    height: 130,
    width: 'auto',
    borderRadius: '0px 0px 20px 20px',
  },
  container: { height: '100%', width: '100%', backgroundColor: 'gray', borderRadius: 20 }
}

const configuration = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

function App() {
  let peerConnection = null;
  let localStream = null;
  let remoteStream = null;
  let roomId = null;
  let localVideo = React.useRef();
  let remoteVideo = React.useRef();

  React.useEffect(() => {
    openUserMedia();
    document.querySelector("#hangupBtn").addEventListener("click", hangUp);
    document.querySelector("#createBtn").addEventListener("click", createRoom);
    document.querySelector("#joinBtn").addEventListener("click", joinRoom);
  }, []);

  async function createRoom() {
    console.log("async function createRoom()", 0);
    document.querySelector("#createBtn").disabled = true;
    document.querySelector("#joinBtn").disabled = true;
    const roomRef = await db.collection("rooms").doc();
    console.log(roomRef);
    console.log("Create PeerConnection with configuration: ", configuration);
    peerConnection = new RTCPeerConnection(configuration);

    registerPeerConnectionListeners();

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    // Code for collecting ICE candidates below
    const callerCandidatesCollection = roomRef.collection("callerCandidates");

    peerConnection.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        console.log("Got final candidate!");
        return;
      }
      console.log("Got candidate: ", event.candidate);
      callerCandidatesCollection.add(event.candidate.toJSON());
    });
    // Code for collecting ICE candidates above

    // Code for creating a room below
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log("Created offer:", offer);

    const roomWithOffer = {
      offer: {
        type: offer.type,
        sdp: offer.sdp,
      },
    };
    await roomRef.set(roomWithOffer);
    roomId = roomRef.id;
    console.log(`New room created with SDP offer. Room ID: ${roomRef.id} - You are the caller!`);
    document.querySelector(
      "#currentRoom"
    ).innerText = `room id: ${roomRef.id}`;
    // Code for creating a room above

    peerConnection.addEventListener("track", (event) => {
      console.log("Got remote track:", event.streams[0]);
      event.streams[0].getTracks().forEach((track) => {
        console.log("Add a track to the remoteStream:", track);
        remoteStream.addTrack(track);
      });
    });

    // Listening for remote session description below
    roomRef.onSnapshot(async (snapshot) => {
      const data = snapshot.data();
      if (!peerConnection.currentRemoteDescription && data && data.answer) {
        console.log("Got remote description: ", data.answer);
        const rtcSessionDescription = new RTCSessionDescription(data.answer);
        await peerConnection.setRemoteDescription(rtcSessionDescription);
      }
    });
    // Listening for remote session description above

    // Listen for remote ICE candidates below
    roomRef.collection("calleeCandidates").onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === "added") {
          let data = change.doc.data();
          console.log(`Got new remote ICE candidate: ${JSON.stringify(data)}`);
          await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
      });
    });
    // Listen for remote ICE candidates above
  }

  function joinRoom() {
    document.querySelector("#createBtn").disabled = true;
    document.querySelector("#joinBtn").disabled = true;
    joinRoomById(prompt("Please Enter Key", ""));
  }

  async function joinRoomById(roomId) {
    const roomRef = db.collection("rooms").doc(`${roomId}`);
    const roomSnapshot = await roomRef.get();
    console.log("Got room:", roomSnapshot.exists);

    if (roomSnapshot.exists) {
      console.log("Create PeerConnection with configuration: ", configuration);
      peerConnection = new RTCPeerConnection(configuration);
      registerPeerConnectionListeners();
      localStream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, localStream);
      });

      // Code for collecting ICE candidates below
      const calleeCandidatesCollection = roomRef.collection("calleeCandidates");
      peerConnection.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("Got final candidate!");
          return;
        }
        console.log("Got candidate: ", event.candidate);
        calleeCandidatesCollection.add(event.candidate.toJSON());
      });
      // Code for collecting ICE candidates above

      peerConnection.addEventListener("track", (event) => {
        console.log("Got remote track:", event.streams[0]);
        event.streams[0].getTracks().forEach((track) => {
          console.log("Add a track to the remoteStream:", track);
          remoteStream.addTrack(track);
        });
      });

      // Code for creating SDP answer below
      const offer = roomSnapshot.data().offer;
      console.log("Got offer:", offer);
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      const answer = await peerConnection.createAnswer();
      console.log("Created answer:", answer);
      await peerConnection.setLocalDescription(answer);

      const roomWithAnswer = {
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
      };
      await roomRef.update(roomWithAnswer);
      // Code for creating SDP answer above

      // Listening for remote ICE candidates below
      roomRef.collection("callerCandidates").onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === "added") {
            let data = change.doc.data();
            console.log(
              `Got new remote ICE candidate: ${JSON.stringify(data)}`
            );
            await peerConnection.addIceCandidate(new RTCIceCandidate(data));
          }
        });
      });
      // Listening for remote ICE candidates above
    }
  }

  async function openUserMedia() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    localVideo.current.srcObject = stream;
    localStream = stream;
    remoteStream = new MediaStream();
    remoteVideo.current.srcObject = remoteStream;
    console.log("Stream:", localVideo.current.srcObject);
    document.querySelector("#joinBtn").disabled = false;
    document.querySelector("#createBtn").disabled = false;
    document.querySelector("#hangupBtn").disabled = false;
  }

  async function hangUp(e) {
    console.log("async function hangup()", 0);
    const tracks = document.querySelector("#localVideo").srcObject.getTracks();
    tracks.forEach((track) => {
      track.stop();
    });

    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
    }

    if (peerConnection) {
      peerConnection.close();
    }

    localVideo.current.srcObject = null;
    remoteVideo.current.srcObject = null;
    document.querySelector("#joinBtn").disabled = true;
    document.querySelector("#createBtn").disabled = true;
    document.querySelector("#hangupBtn").disabled = true;
    document.querySelector("#currentRoom").innerText = "";

    // Delete room on hangup
    if (roomId) {
      const roomRef = db.collection("rooms").doc(roomId);
      const calleeCandidates = await roomRef
        .collection("calleeCandidates")
        .get();
      calleeCandidates.forEach(async (candidate) => {
        await candidate.ref.delete();
      });
      const callerCandidates = await roomRef
        .collection("callerCandidates")
        .get();
      callerCandidates.forEach(async (candidate) => {
        await candidate.ref.delete();
      });
      await roomRef.delete();
    }

    document.location.reload(true);
  }

  function registerPeerConnectionListeners() {
    peerConnection.addEventListener("icegatheringstatechange", () => {
      console.log(
        `ICE gathering state changed: ${peerConnection.iceGatheringState}`
      );
    });

    peerConnection.addEventListener("connectionstatechange", () => {
      console.log(`Connection state change: ${peerConnection.connectionState}`);
    });

    peerConnection.addEventListener("signalingstatechange", () => {
      console.log(`Signaling state change: ${peerConnection.signalingState}`);
    });

    peerConnection.addEventListener("iceconnectionstatechange ", () => {
      console.log(
        `ICE connection state change: ${peerConnection.iceConnectionState}`
      );
    });
  }

  React.useEffect(() => {
    dragElement(document.getElementById("mydiv"));

    function dragElement(elmnt) {
      var pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      if (document.getElementById(elmnt.id + "header")) {
        // if present, the header is where you move the DIV from:
        document.getElementById(elmnt.id + "header").onmousedown = dragMouseDown;
      } else {
        // otherwise, move the DIV from anywhere inside the DIV:
        elmnt.onmousedown = dragMouseDown;
      }

      function dragMouseDown(e) {
        e = e || window.event;
        e.preventDefault();
        // get the mouse cursor position at startup:
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        // call a function whenever the cursor moves:
        document.onmousemove = elementDrag;
      }

      function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        // calculate the new cursor position:
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        // set the element's new position:
        elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
        elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
      }

      function closeDragElement() {
        // stop moving when mouse button is released:
        document.onmouseup = null;
        document.onmousemove = null;
      }
    }
  }, [])

  return (
    <>
    <div id='main' style={{ backgroundColor: 'rgb(24 80 97)', height: window.innerHeight, width: window.innerWidth, display: 'flex', justifyContent: 'center', alignItems: 'center' }} >
      <div style={styles.container} >
        <div id="mydiv">
          <div id="mydivheader">move</div>
          <video
            style={{...styles.localVideo, ...styles.layer }}
            ref={localVideo}
            id="localVideo"
            muted
            autoPlay
            playsInline
          ></video>
        </div>
        <div style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', objectFit: 'cover' }}>
          <video style={{ ...styles.video, ...styles.layer }} ref={remoteVideo} id="remoteVideo" autoPlay playsInline></video>
        </div>
      </div>
    </div>
    <div id="buttons" style={{
        position: 'absolute',
        bottom: 0,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: 100,
        width: window.innerWidth,
        background: 'rgba( 255, 255, 255, 0.25 )',
        boxShadow: '0 8px 32px 0 rgba( 31, 38, 135, 0.37 )',
        backdropFilter: 'blur( 3.0px )',
        webkitBackdropFilter: 'blur( 3.0px )',
        borderRadius: '10px 10px 0px 0px',
        border: '1px solid rgba( 255, 255, 255, 0.18 )',
      }}>
        <button disabled id="createBtn">
          Create Meet
        </button>
        <button disabled id="joinBtn">
          Join Meet
        </button>
        <button disabled id="hangupBtn">
          Hangup
        </button>
        <div id="currentRoom"></div>
      </div>
    </>
  );
}

export default App;
