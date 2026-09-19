import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDi2Wa1qW8KCVdr3FLXB8snRwp_Y9KPU50",

  authDomain: "internshala-5cde7.firebaseapp.com",

  projectId: "internshala-5cde7",

  storageBucket: "internshala-5cde7.firebasestorage.app",

  messagingSenderId: "767573024582",

  appId: "1:767573024582:web:18c0ba22c421ab1bb78f47",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
export { auth, provider };
