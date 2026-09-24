import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBWh4IBzJE5xtfSbJmSXRsS92gaTjcRpg8",
  authDomain: "murdilimax.firebaseapp.com",
  projectId: "murdilimax",
  storageBucket: "murdilimax.firebasestorage.app",
  messagingSenderId: "1032034261470",
  appId: "1:1032034261470:web:74a93ef30b964b9240e54f",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
export const OWNER_EMAIL = "dshtriters@gmail.com";
