import { useState, useEffect, useCallback } from 'react';
import { auth, db, googleProvider } from '../firebase';
import { onAuthStateChanged, User, signInWithPopup, signOut } from 'firebase/auth';

export function useAuth() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setLoading(false);
    });
    return unsub;
  }, []);

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  return { currentUser, loading, signInWithGoogle, signOut: signOutUser };
}
