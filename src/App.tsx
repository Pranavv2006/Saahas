/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Shield, MapPin, Bell, Users, ChevronRight, ArrowRight, Footprints, ArrowLeft, Home, User, Edit, CheckCircle, ChevronDown, Search, ShieldCheck, AlertTriangle, X, Menu, Clock, Ruler, Activity, HeartPulse, Camera, Plus, Trash2, Navigation, UserCheck, ShieldAlert, Delete, Phone, PhoneOff, Mic, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef } from 'react';

type Screen = 'landing' | 'guest-setup' | 'registered-user' | 'profile-setup' | 'active-walk' | 'walk-complete' | 'fake-call' | 'alert-sent' | 'pin-confirm' | 'shadow-mode' | 'fake-call-pin-confirm';

export default function App() {
  // Check if user is registered on mount
  const [isUserRegistered, setIsUserRegistered] = useState(false);
  const [registeredUserName, setRegisteredUserName] = useState('');
  
  useEffect(() => {
    const userData = localStorage.getItem('saahas_user');
    if (userData) {
      try {
        const user = JSON.parse(userData);
        setRegisteredUserName(user.name || 'User');
        setIsUserRegistered(true);
      } catch {}
    }
  }, []);

  const [currentScreen, setCurrentScreen] = useState<Screen>('landing');
  const [guardianStatus, setGuardianStatus] = useState<'searching' | 'found' | 'not-found'>('searching');
  const [guardianAcknowledged, setGuardianAcknowledged] = useState(false);
  const [shadowModeSearchTime, setShadowModeSearchTime] = useState(0);
  const [isCallInProgress, setIsCallInProgress] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [fakeCallPinTimer, setFakeCallPinTimer] = useState(30);
  const [fakeCallPinAttempt, setFakeCallPinAttempt] = useState('');
  const [fakeCallPinError, setFakeCallPinError] = useState(false);
  const [fakeCallPinSuccess, setFakeCallPinSuccess] = useState(false);
  const [alertTriggerReason, setAlertTriggerReason] = useState<string | null>(null);
  const fakeCallAlertTimeout = useRef<NodeJS.Timeout | null>(null);
  const fakeCallPinInterval = useRef<NodeJS.Timeout | null>(null);
  const ringtoneOscillator = useRef<OscillatorNode | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  // Shadow Mode Simulation Logic
  useEffect(() => {
    if (currentScreen === 'shadow-mode') {
      setGuardianStatus('searching');
      setGuardianAcknowledged(false);
      setShadowModeSearchTime(0);

      const searchInterval = setInterval(() => {
        setShadowModeSearchTime(prev => prev + 1);
      }, 1000);

      // Simulate finding a guardian after 5 seconds
      const findTimeout = setTimeout(() => {
        setGuardianStatus('found');
      }, 5000);

      // Simulate guardian acknowledging after 10 seconds
      const acknowledgeTimeout = setTimeout(() => {
        setGuardianAcknowledged(true);
      }, 10000);

      // Simulate "Not Found" after 2 minutes (120 seconds)
      const notFoundTimeout = setTimeout(() => {
        setGuardianStatus('not-found');
      }, 120000);

      return () => {
        clearInterval(searchInterval);
        clearTimeout(findTimeout);
        clearTimeout(acknowledgeTimeout);
        clearTimeout(notFoundTimeout);
      };
    }
  }, [currentScreen]);

  // Ringtone Logic
  const playRingtone = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    if (ringtoneOscillator.current) return;

    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, audioCtx.current.currentTime);
    
    // Simple pulsing ringtone
    gain.gain.setValueAtTime(0, audioCtx.current.currentTime);
    const now = audioCtx.current.currentTime;
    for (let i = 0; i < 60; i += 2) {
      gain.gain.linearRampToValueAtTime(0.2, now + i);
      gain.gain.linearRampToValueAtTime(0, now + i + 1);
    }
    
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    
    osc.start();
    ringtoneOscillator.current = osc;
  };

  const stopRingtone = () => {
    if (ringtoneOscillator.current) {
      ringtoneOscillator.current.stop();
      ringtoneOscillator.current = null;
    }
  };

  // Fake Call Logic
  useEffect(() => {
    if (currentScreen === 'fake-call') {
      if (!isCallInProgress) {
        playRingtone();
      }
    } else {
      stopRingtone();
    }
    
    return () => stopRingtone();
  }, [currentScreen, isCallInProgress]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCallInProgress && currentScreen === 'fake-call') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isCallInProgress, currentScreen]);

  const formatCallTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const clearFakeCallAlert = () => {
    if (fakeCallAlertTimeout.current) {
      clearTimeout(fakeCallAlertTimeout.current);
      fakeCallAlertTimeout.current = null;
    }
  };

  // Fake Call Safety Check Logic
  useEffect(() => {
    if (currentScreen === 'fake-call-pin-confirm') {
      setFakeCallPinTimer(30);
      setFakeCallPinAttempt('');
      setFakeCallPinError(false);
      setFakeCallPinSuccess(false);

      fakeCallPinInterval.current = setInterval(() => {
        setFakeCallPinTimer((prev) => {
          if (prev <= 1) {
            clearInterval(fakeCallPinInterval.current!);
            if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
            setAlertTriggerReason('Safety check failed after fake call');
            setCurrentScreen('alert-sent');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (fakeCallPinInterval.current) clearInterval(fakeCallPinInterval.current);
    }
    return () => {
      if (fakeCallPinInterval.current) clearInterval(fakeCallPinInterval.current);
    };
  }, [currentScreen]);

  const handleFakeCallPinInput = (digit: string) => {
    if (fakeCallPinAttempt.length < 4 && !fakeCallPinError && !fakeCallPinSuccess) {
      const newAttempt = fakeCallPinAttempt + digit;
      setFakeCallPinAttempt(newAttempt);

      if (newAttempt.length === 4) {
        const correctPin = guestData.pin.join('') || profileData.pin.join('');
        if (newAttempt === correctPin) {
          setFakeCallPinSuccess(true);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setTimeout(() => {
            setCurrentScreen('active-walk');
          }, 1000);
        } else {
          setFakeCallPinError(true);
          if (navigator.vibrate) navigator.vibrate(500);
          setAlertTriggerReason('Safety check failed after fake call');
          setTimeout(() => {
            setCurrentScreen('alert-sent');
          }, 800);
        }
      }
    }
  };

  const handleFakeCallPinBackspace = () => {
    if (!fakeCallPinError && !fakeCallPinSuccess) {
      setFakeCallPinAttempt(prev => prev.slice(0, -1));
    }
  };

  const [guestData, setGuestData] = useState({
    name: '',
    phone: '',
    contact1: '',
    contact2: '',
    duration: 15,
    customHours: 0,
    customMinutes: 45,
    isCustom: false,
    pin: ['', '', '', '']
  });

  const [profileData, setProfileData] = useState({
    fullName: '',
    phone: '',
    homeAddress: '',
    avatar: '👤',
    contact1Name: '',
    contact1Phone: '',
    contact1Role: 'Family',
    contact2Name: '',
    contact2Phone: '',
    contact2Role: 'Friend',
    guardianName: 'Mom',
    alertMessage: 'I may be in danger. My last known location:',
    defaultDuration: 10,
    pin: ['', '', '', '']
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showSecurityQuestion, setShowSecurityQuestion] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('Profile saved. You\'re protected.');
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [startTime, setStartTime] = useState<string>('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [confirmationPin, setConfirmationPin] = useState(['', '', '', '']);
  const [pinTimeout, setPinTimeout] = useState(60);
  const [isAlertActive, setIsAlertActive] = useState(false);
  const [walkSummary, setWalkSummary] = useState({
    duration: '00:00',
    distance: '0.0 km',
    gaitEvents: 'None detected',
    alertsSent: 'None',
    steps: '0'
  });

  const [showAlertCancelModal, setShowAlertCancelModal] = useState(false);
  const [alertCancelPinAttempt, setAlertCancelPinAttempt] = useState('');
  const [alertCancelPinError, setAlertCancelPinError] = useState<string | null>(null);
  const [alertCancelPinSuccess, setAlertCancelPinSuccess] = useState(false);
  const [alertCancelWrongAttempts, setAlertCancelWrongAttempts] = useState(0);
  const [walkId, setWalkId] = useState<string | null>(null);

  // Active Walk Specific State
  const [currentLocation, setCurrentLocation] = useState('Locating...');
  const [lastLocationUpdate, setLastLocationUpdate] = useState(0);
  const [gpsStatus, setGpsStatus] = useState<'live' | 'limited' | 'error'>('live');
  const [isBufferActive, setIsBufferActive] = useState(false);
  const [bufferTime, setBufferTime] = useState(30);
  const [tapCount, setTapCount] = useState(0);
  const [sosTapCount, setSosTapCount] = useState(0);
  const [showNavGuard, setShowNavGuard] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelPinAttempt, setCancelPinAttempt] = useState('');
  const [cancelPinTimer, setCancelPinTimer] = useState(30);
  const [cancelPinError, setCancelPinError] = useState(false);
  const [showActiveToast, setShowActiveToast] = useState(false);
  const [pinAttempt, setPinAttempt] = useState<string[]>([]);
  const [pinConfirmTimer, setPinConfirmTimer] = useState(30);
  const [pinError, setPinError] = useState(false);
  const [showDismissWarning, setShowDismissWarning] = useState(false);
  const breadcrumbs = useRef<{ lat: number; lng: number; time: number }[]>([]);
  const wakeLock = useRef<any>(null);
  const tapTimeout = useRef<NodeJS.Timeout | null>(null);
  const sosTapTimeout = useRef<NodeJS.Timeout | null>(null);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentScreen === 'active-walk' && timeLeft > 0 && !isAlertActive) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && currentScreen === 'active-walk' && !isAlertActive && !isBufferActive) {
      setIsBufferActive(true);
      setBufferTime(30);
    }
    return () => clearInterval(interval);
  }, [currentScreen, timeLeft, isAlertActive, isBufferActive]);

  // Buffer Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBufferActive && bufferTime > 0 && !isAlertActive) {
      interval = setInterval(() => {
        setBufferTime((prev) => prev - 1);
      }, 1000);
    } else if (isBufferActive && bufferTime === 0 && !isAlertActive) {
      setIsAlertActive(true);
      setCurrentScreen('alert-sent');
    }
    return () => clearInterval(interval);
  }, [isBufferActive, bufferTime, isAlertActive]);

  // PIN Confirmation Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentScreen === 'pin-confirm' && pinConfirmTimer > 0 && !pinError) {
      interval = setInterval(() => {
        setPinConfirmTimer((prev) => prev - 1);
      }, 1000);
    } else if (currentScreen === 'pin-confirm' && pinConfirmTimer === 0 && !pinError) {
      setIsAlertActive(true);
      setCurrentScreen('alert-sent');
    }
    return () => clearInterval(interval);
  }, [currentScreen, pinConfirmTimer, pinError]);

  // Cancel Walk PIN Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showCancelModal && cancelPinTimer > 0) {
      interval = setInterval(() => {
        setCancelPinTimer((prev) => prev - 1);
      }, 1000);
    } else if (showCancelModal && cancelPinTimer === 0) {
      setShowCancelModal(false);
      setShowActiveToast(true);
      setTimeout(() => setShowActiveToast(false), 2000);
    }
    return () => clearInterval(interval);
  }, [showCancelModal, cancelPinTimer]);

  // Intercept back button
  useEffect(() => {
    if (currentScreen === 'active-walk') {
      window.history.pushState(null, '', window.location.href);
      
      const handlePopState = (e: PopStateEvent) => {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        setShowCancelModal(true);
        setCancelPinTimer(30);
        setCancelPinAttempt('');
        setCancelPinError(false);
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, [currentScreen]);

  const handleCancelPinInput = (digit: string) => {
    if (cancelPinAttempt.length < 4 && !cancelPinError) {
      const newAttempt = cancelPinAttempt + digit;
      setCancelPinAttempt(newAttempt);

      if (newAttempt.length === 4) {
        const correctPin = guestData.pin.join('') || profileData.pin.join('');
        if (newAttempt === correctPin) {
          // Success - Cancel Walk
          setShowCancelModal(false);
          setTimeLeft(0);
          setIsBufferActive(false);
          setIsAlertActive(false);
          setCurrentScreen('landing');
          setAlertTriggerReason(null);
          setToastMessage('Walk cancelled safely.');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
          // Release WakeLock is handled by useEffect on currentScreen change
        } else {
          // Wrong PIN
          setCancelPinError(true);
          if (navigator.vibrate) navigator.vibrate(500);
          setTimeout(() => {
            setCancelPinAttempt('');
            setCancelPinError(false);
            setCancelPinTimer(30); // Reset countdown
          }, 1500);
        }
      }
    }
  };

  const handleCancelPinBackspace = () => {
    if (!cancelPinError) {
      setCancelPinAttempt(prev => prev.slice(0, -1));
    }
  };

  const handlePinInput = (digit: string) => {
    if (pinAttempt.length < 4 && !pinError) {
      const newAttempt = [...pinAttempt, digit];
      setPinAttempt(newAttempt);
      
      if (newAttempt.length === 4) {
        const correctPin = guestData.pin.join('') || profileData.pin.join('');
        if (newAttempt.join('') === correctPin) {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          setTimeout(() => setCurrentScreen('walk-complete'), 500);
        } else {
          setPinError(true);
          if (navigator.vibrate) navigator.vibrate(500);
          setIsAlertActive(true);
          setTimeout(() => setCurrentScreen('alert-sent'), 1000);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    if (!pinError) {
      setPinAttempt(prev => prev.slice(0, -1));
    }
  };

  const handleAlertCancelPinInput = (digit: string) => {
    if (alertCancelPinAttempt.length < 4 && !alertCancelPinError && !alertCancelPinSuccess) {
      const newAttempt = alertCancelPinAttempt + digit;
      setAlertCancelPinAttempt(newAttempt);

      if (newAttempt.length === 4) {
        const correctPin = guestData.pin.join('') || profileData.pin.join('');
        if (newAttempt === correctPin) {
          setAlertCancelPinSuccess(true);
          setAlertCancelPinError(null);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          
          // Call API
          fetch('/api/cancel-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walkId })
          }).catch(err => console.error('Failed to cancel alert:', err));

          setTimeout(() => {
            setShowAlertCancelModal(false);
            setCurrentScreen('walk-complete');
            // Reset state
            setAlertCancelPinAttempt('');
            setAlertCancelPinSuccess(false);
            setAlertCancelWrongAttempts(0);
          }, 2000);
        } else {
          const newWrongAttempts = alertCancelWrongAttempts + 1;
          setAlertCancelWrongAttempts(newWrongAttempts);
          setAlertCancelPinError('Wrong PIN. Alert remains active.');
          if (navigator.vibrate) navigator.vibrate(500);
          
          if (newWrongAttempts >= 3) {
            setTimeout(() => {
              setShowAlertCancelModal(false);
              setToastMessage('Too many wrong attempts. Alert cannot be cancelled.');
              setShowToast(true);
              setTimeout(() => setShowToast(false), 3000);
              setAlertCancelPinAttempt('');
              setAlertCancelPinError(null);
            }, 1500);
          } else {
            setTimeout(() => {
              setAlertCancelPinAttempt('');
              setAlertCancelPinError(null);
            }, 1000);
          }
        }
      }
    }
  };

  const handleAlertCancelPinBackspace = () => {
    if (!alertCancelPinError && !alertCancelPinSuccess) {
      setAlertCancelPinAttempt(prev => prev.slice(0, -1));
    }
  };

  // GPS Logic
  useEffect(() => {
    if (currentScreen !== 'active-walk') return;

    let watchId: number;
    const startGps = () => {
      if ('geolocation' in navigator) {
        watchId = navigator.geolocation.watchPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            setGpsStatus('live');
            setLastLocationUpdate(0);
            
            // Breadcrumbs every 60s
            const now = Date.now();
            if (breadcrumbs.current.length === 0 || now - breadcrumbs.current[breadcrumbs.current.length - 1].time > 60000) {
              breadcrumbs.current.push({ lat: latitude, lng: longitude, time: now });
            }

            // Reverse Geocode
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
              const data = await res.json();
              setCurrentLocation(data.display_name.split(',')[0] + ', ' + (data.address.suburb || data.address.neighbourhood || ''));
            } catch (e) {
              console.error("Geocoding failed", e);
            }
          },
          (error) => {
            console.error("GPS Error", error);
            setGpsStatus('limited');
          },
          { enableHighAccuracy: true }
        );
      }
    };

    startGps();
    const locInterval = setInterval(() => setLastLocationUpdate(prev => prev + 1), 1000);

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      clearInterval(locInterval);
    };
  }, [currentScreen]);

  // Wake Lock Logic
  useEffect(() => {
    const requestWakeLock = async () => {
      if ('wakeLock' in navigator && currentScreen === 'active-walk') {
        try {
          // Check if we already have a lock
          if (wakeLock.current) return;
          
          wakeLock.current = await (navigator as any).wakeLock.request('screen');
          console.log("Wake Lock acquired successfully");
          
          wakeLock.current.addEventListener('release', () => {
            console.log('Wake Lock was released');
            wakeLock.current = null;
          });
        } catch (err: any) {
          if (err.name === 'NotAllowedError') {
            console.warn("Wake Lock permission denied by policy. This is expected in some iframe environments.");
          } else {
            console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
          }
        }
      }
    };

    const handleVisibilityChange = async () => {
      if (wakeLock.current !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
      }
    };

    if (currentScreen === 'active-walk') {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else if (wakeLock.current) {
      wakeLock.current.release();
      wakeLock.current = null;
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock.current) {
        wakeLock.current.release();
        wakeLock.current = null;
      }
    };
  }, [currentScreen]);

  // Tap Handlers
  const handleTimerTap = () => {
    setTapCount(prev => prev + 1);
    if (tapTimeout.current) clearTimeout(tapTimeout.current);
    tapTimeout.current = setTimeout(() => setTapCount(0), 1500);
  };

  useEffect(() => {
    if (tapCount === 3) {
      setCurrentScreen('fake-call');
      setTapCount(0);
    }
  }, [tapCount]);

  const handleGlobalTap = (e: React.MouseEvent) => {
    // Exclude "Arrived Safely" button
    if ((e.target as HTMLElement).closest('.arrived-safely-btn')) return;

    setSosTapCount(prev => prev + 1);
    if (sosTapTimeout.current) clearTimeout(sosTapTimeout.current);
    sosTapTimeout.current = setTimeout(() => setSosTapCount(0), 3000);
  };

  useEffect(() => {
    if (sosTapCount === 10) {
      setIsAlertActive(true);
      setSosTapCount(0);
    }
  }, [sosTapCount]);

  // PIN Modal Timeout logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPinModalOpen && pinTimeout > 0 && !isAlertActive) {
      interval = setInterval(() => {
        setPinTimeout((prev) => prev - 1);
      }, 1000);
    } else if (isPinModalOpen && pinTimeout === 0 && !isAlertActive) {
      setIsAlertActive(true);
      console.log("PIN Timeout! SOS Alert Fired.");
    }
    return () => clearInterval(interval);
  }, [isPinModalOpen, pinTimeout, isAlertActive]);

  const handleConfirmationPinChange = (index: number, value: string) => {
    const newPin = [...confirmationPin];
    newPin[index] = value.slice(-1);
    setConfirmationPin(newPin);

    // Auto-focus next input
    if (value && index < 3) {
      document.getElementById(`pin-input-${index + 1}`)?.focus();
    }

    // Check PIN when last digit is entered
    if (index === 3 && value) {
      const enteredPin = newPin.join('');
      const correctPin = currentScreen === 'active-walk' ? (guestData.pin.join('') || profileData.pin.join('')) : '';
      
      // For demo purposes, we'll check against both guest and profile pins
      // In a real app, we'd know which one to check
      const actualCorrectPin = guestData.pin.join('') || profileData.pin.join('');

      if (enteredPin === actualCorrectPin) {
        // Success
        setIsPinModalOpen(false);
        setWalkSummary({
          duration: formatTime(totalTime - timeLeft),
          distance: (Math.random() * (1.5 - 0.5) + 0.5).toFixed(1) + ' km', // Simulated distance
          gaitEvents: 'None detected',
          alertsSent: 'None',
          steps: (Math.floor(Math.random() * 5000) + 2000).toString()
        });
        setCurrentScreen('walk-complete');
        setConfirmationPin(['', '', '', '']);
        setPinTimeout(60);
      } else {
        // Wrong PIN - Alert immediately
        setIsAlertActive(true);
        console.log("Wrong PIN! SOS Alert Fired.");
      }
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startWalk = (durationMinutes: number) => {
    const totalSeconds = durationMinutes * 60;
    const newWalkId = Math.random().toString(36).substring(2, 11);
    setWalkId(newWalkId);
    setTimeLeft(totalSeconds);
    setTotalTime(totalSeconds);
    setStartTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setCurrentScreen('active-walk');
  };

  // Save to localStorage whenever guestData changes
  useEffect(() => {
    localStorage.setItem('saahas_guest', JSON.stringify(guestData));
  }, [guestData]);

  // Save registered user data
  useEffect(() => {
    localStorage.setItem('saahas_user', JSON.stringify(profileData));
  }, [profileData]);

  const handleGuestPinChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newPin = [...guestData.pin];
    newPin[index] = value;
    setGuestData({ ...guestData, pin: newPin });
    
    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`pin-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleProfilePinChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newPin = [...profileData.pin];
    newPin[index] = value;
    setProfileData({ ...profileData, pin: newPin });
    
    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`profile-pin-${index + 1}`);
      nextInput?.focus();
    }
  };

  const handleDeleteData = () => {
    setGuestData({
      name: '',
      phone: '',
      contact1: '',
      contact2: '',
      duration: 15,
      customHours: 0,
      customMinutes: 45,
      isCustom: false,
      pin: ['', '', '', '']
    });
    setProfileData({
      fullName: '',
      phone: '',
      homeAddress: '',
      avatar: '👤',
      contact1Name: '',
      contact1Phone: '',
      contact1Role: 'Family',
      contact2Name: '',
      contact2Phone: '',
      contact2Role: 'Friend',
      guardianName: 'Mom',
      alertMessage: 'I may be in danger. My last known location:',
      defaultDuration: 10,
      pin: ['', '', '', '']
    });
    localStorage.removeItem('saahas_guest');
    setShowDeleteModal(false);
    setCurrentScreen('landing');
  };

  return (
    <div className="min-h-screen bg-[#050608] text-white font-sans overflow-x-hidden relative selection:bg-[#FF8A65]/30">
      <AnimatePresence mode="wait">
        {currentScreen === 'landing' ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen flex flex-col items-center justify-between p-8 relative"
          >
            {/* Premium Background Atmosphere */}
            <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[60%] bg-blue-600/5 rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute bottom-[-5%] right-[-5%] w-[70%] h-[50%] bg-orange-600/5 rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,138,101,0.03),transparent)] pointer-events-none" />
            <div className="absolute inset-0 bg-linear-to-b from-transparent via-[#050608]/30 to-[#050608] pointer-events-none" />
            
            {/* Top Section: Creative Logo & Typography */}
            <div className="flex flex-col items-center mt-16 z-10">
              <motion.div 
                initial={{ opacity: 0, y: -30, rotate: -10 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ duration: 1, ease: [0.23, 1, 0.32, 1] }}
                className="relative mb-10"
              >
                <div className="absolute inset-0 bg-[#FF8A65]/20 blur-2xl rounded-full scale-150 animate-pulse" />
                <div className="w-28 h-28 bg-linear-to-br from-[#1E2333] to-[#151926] rounded-[2.5rem] flex items-center justify-center shadow-[0_25px_60px_rgba(0,0,0,0.6)] border border-white/10 relative group overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-full bg-linear-to-br from-white/10 to-transparent pointer-events-none" />
                  <div className="relative flex items-center justify-center">
                    <Shield className="w-14 h-14 text-[#FF8A65] drop-shadow-[0_0_20px_rgba(255,138,101,0.6)]" fill="currentColor" fillOpacity={0.15} />
                    <motion.div 
                      animate={{ y: [0, -2, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      className="absolute"
                    >
                      <Footprints className="w-6 h-6 text-white/90" />
                    </motion.div>
                  </div>
                  <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#FF8A65]/30 rounded-[2.5rem] transition-all duration-700" />
                </div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4, duration: 0.8, ease: "easeOut" }}
                className="flex flex-col items-center text-center"
              >
                <h1 className="text-[5.5rem] font-hindi font-bold tracking-tight leading-none flex items-baseline select-none relative">
                  <span className="bg-linear-to-b from-white to-gray-400 bg-clip-text text-transparent">स</span>
                  <span className="text-[4.5rem] -mx-0.5 bg-linear-to-tr from-[#FF8A65] via-[#FFB74D] to-[#FF8A65] bg-clip-text text-transparent font-display font-black italic tracking-tighter drop-shadow-[0_0_20px_rgba(255,138,101,0.3)]">AA</span>
                  <span className="bg-linear-to-b from-white to-gray-400 bg-clip-text text-transparent">हस</span>
                </h1>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "120%" }}
                  transition={{ delay: 1, duration: 1 }}
                  className="h-px bg-linear-to-r from-transparent via-[#FF8A65]/40 to-transparent mt-4 mb-2"
                />
                <p className="text-[10px] uppercase tracking-[0.5em] text-gray-500 font-bold opacity-70">
                  Your Silence Has a Voice
                </p>
              </motion.div>
            </div>

            {/* Middle Section: Primary Action & Features */}
            <div className="w-full max-w-sm flex flex-col items-center gap-16 z-10">
              <motion.button
                whileHover={{ scale: 1.03, translateY: -3 }}
                whileTap={{ scale: 0.97 }}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                onClick={() => setCurrentScreen(isUserRegistered ? 'registered-user' : 'guest-setup')}
                className="w-full py-6 bg-linear-to-r from-[#FF8A65] to-[#FFB74D] rounded-[1.25rem] flex items-center justify-center gap-4 text-black font-black text-xl shadow-[0_20px_50px_-10px_rgba(255,138,101,0.6)] relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <motion.div 
                  className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-shimmer"
                  initial={false}
                />
                <span className="relative tracking-tight">START WALK NOW</span>
                <ArrowRight className="w-6 h-6 relative group-hover:translate-x-1 transition-transform" strokeWidth={3} />
              </motion.button>

              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2, duration: 1 }}
                className="grid grid-cols-3 w-full gap-6"
              >
                <div className="flex flex-col items-center gap-3 group cursor-pointer">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-white/10 group-hover:border-white/20 transition-all duration-500 shadow-lg">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black group-hover:text-gray-300 transition-colors">Live GPS</span>
                </div>
                <div className="flex flex-col items-center gap-3 group cursor-pointer">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-gray-400 group-hover:text-[#FF8A65] group-hover:bg-white/10 group-hover:border-[#FF8A65]/30 transition-all duration-500 shadow-lg">
                    <Bell className="w-6 h-6" />
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black group-hover:text-gray-300 transition-colors">SOS Alert</span>
                </div>
                <div className="flex flex-col items-center gap-3 group cursor-pointer">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex items-center justify-center text-gray-400 group-hover:text-white group-hover:bg-white/10 group-hover:border-white/20 transition-all duration-500 shadow-lg">
                    <Users className="w-6 h-6" />
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black group-hover:text-gray-300 transition-colors">Safe Network</span>
                </div>
              </motion.div>
            </div>

            {/* Bottom Section: Footer Link */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.8 }}
              className="mb-10 z-10"
            >
              <button 
                onClick={() => setCurrentScreen('profile-setup')}
                className="flex items-center gap-2 text-gray-500 hover:text-white transition-all duration-500 text-sm font-bold tracking-widest group"
              >
                Login / Setup Profile
                <ChevronRight className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" />
              </button>
            </motion.div>
          </motion.div>
        ) : currentScreen === 'profile-setup' ? (
          <motion.div
            key="profile-setup"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen flex flex-col bg-background relative"
          >
            {/* Header Section */}
            <header className="px-6 pt-8 pb-4 flex items-center justify-between sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-outline-variant/10">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setCurrentScreen('landing')}
                  className="p-2 -ml-2 rounded-full hover:bg-surface-highest transition-colors active:scale-95 duration-200"
                >
                  <ArrowLeft className="w-6 h-6 text-primary" />
                </button>
                <h1 className="font-headline font-bold text-white tracking-tight text-xl">सAAहस</h1>
              </div>
            </header>

            <main className="flex-1 px-6 pt-8 pb-32 overflow-y-auto max-w-2xl mx-auto w-full">
              {/* Profile Header Section */}
              <section className="flex items-center gap-6 mb-10">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-surface-container-highest flex items-center justify-center border-2 border-outline-variant/15">
                    <User className="w-10 h-10 text-on-surface-variant" />
                  </div>
                  <button className="absolute bottom-0 right-0 bg-primary rounded-full p-1.5 active:scale-90 transition-transform shadow-lg">
                    <Edit className="w-3.5 h-3.5 text-on-primary" />
                  </button>
                </div>
                <div>
                  <h2 className="font-headline text-2xl font-bold text-white">Identity & Safety</h2>
                  <p className="font-label text-sm text-on-surface-variant">Configure your protection protocols</p>
                </div>
              </section>

              {/* Form Fields */}
              <form className="space-y-8" onSubmit={(e) => e.preventDefault()}>
                {/* Identity Group */}
                <div className="space-y-5">
                  <div className="group relative">
                    <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 ml-1 font-bold">Full Name</label>
                    <input 
                      className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:border-primary/20 transition-all outline-none text-on-surface placeholder:text-on-secondary" 
                      placeholder="John Doe" 
                      type="text"
                      value={profileData.fullName}
                      onChange={(e) => setProfileData({ ...profileData, fullName: e.target.value })}
                    />
                  </div>
                  <div className="group relative">
                    <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 ml-1 font-bold">Home Address</label>
                    <div className="relative">
                      <input 
                        className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-xl px-5 py-4 pl-12 focus:ring-1 focus:ring-primary/20 focus:border-primary/20 transition-all outline-none text-on-surface placeholder:text-on-secondary" 
                        placeholder="123 Guardian Way, Safe City" 
                        type="text"
                        value={profileData.homeAddress}
                        onChange={(e) => setProfileData({ ...profileData, homeAddress: e.target.value })}
                      />
                      <Home className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Contacts Group */}
                <div className="bg-surface-container-low p-6 rounded-2xl space-y-6 border border-outline-variant/10">
                  <h3 className="font-headline text-lg font-semibold text-primary">Emergency Network</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="group">
                      <label className="block font-label text-xs text-on-surface-variant mb-2 font-medium">Emergency Contact 1</label>
                      <input 
                        className="w-full bg-surface-container border border-outline-variant/15 rounded-xl px-4 py-3 focus:border-primary/40 outline-none text-on-surface" 
                        placeholder="+1 (555) 000-0000" 
                        type="tel"
                        value={profileData.contact1Phone}
                        onChange={(e) => setProfileData({ ...profileData, contact1Phone: e.target.value })}
                      />
                    </div>
                    <div className="group">
                      <label className="block font-label text-xs text-on-surface-variant mb-2 font-medium">Emergency Contact 2</label>
                      <input 
                        className="w-full bg-surface-container border border-outline-variant/15 rounded-xl px-4 py-3 focus:border-primary/40 outline-none text-on-surface" 
                        placeholder="+1 (555) 000-0000" 
                        type="tel"
                        value={profileData.contact2Phone}
                        onChange={(e) => setProfileData({ ...profileData, contact2Phone: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="group">
                    <label className="block font-label text-xs text-on-surface-variant mb-2 font-medium">Guardian Contact Name</label>
                    <input 
                      className="w-full bg-surface-container border border-outline-variant/15 rounded-xl px-4 py-3 focus:border-primary/40 outline-none text-on-surface font-medium" 
                      type="text" 
                      value={profileData.guardianName}
                      onChange={(e) => setProfileData({ ...profileData, guardianName: e.target.value })}
                    />
                  </div>
                </div>

                {/* Alert Configuration */}
                <div className="space-y-4">
                  <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant ml-1 font-bold">Preset Alert Message</label>
                  <div className="relative">
                    <select 
                      className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-xl px-5 py-4 appearance-none focus:ring-1 focus:ring-primary/20 focus:border-primary/20 outline-none text-on-surface cursor-pointer"
                      value={profileData.alertMessage}
                      onChange={(e) => setProfileData({ ...profileData, alertMessage: e.target.value })}
                    >
                      <option>I may be in danger. My last location:</option>
                      <option>Please check on me immediately:</option>
                      <option>Call police. Last known location:</option>
                    </select>
                    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant w-5 h-5" />
                  </div>
                </div>

                {/* Walk Duration */}
                <div className="space-y-4">
                  <div className="flex justify-between items-end ml-1">
                    <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant font-bold">Default Walk Duration</label>
                    <span className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest font-bold">Optional</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[5, 10, 15, 30].map((min) => (
                      <button 
                        key={min}
                        className={`px-5 py-2.5 rounded-full border transition-all active:scale-95 text-sm font-medium ${
                          profileData.defaultDuration === min 
                          ? 'bg-linear-to-br from-primary to-tertiary text-on-primary border-transparent shadow-lg shadow-primary/20 font-bold' 
                          : 'bg-surface-container border-outline-variant/15 text-on-surface hover:bg-surface-variant'
                        }`} 
                        type="button"
                        onClick={() => setProfileData({ ...profileData, defaultDuration: min })}
                      >
                        {min}
                      </button>
                    ))}
                    <button className="px-6 py-2.5 rounded-full border border-outline-variant/15 bg-surface-container text-sm font-medium hover:bg-surface-variant transition-colors" type="button">Custom</button>
                  </div>
                </div>

                {/* Safety PIN */}
                <div className="bg-surface-container-highest/50 p-8 rounded-3xl border border-primary/5 space-y-6">
                  <div className="text-center space-y-2">
                    <h3 className="font-headline text-xl font-bold text-white tracking-tight">Create Your Safety PIN</h3>
                    <p className="font-body text-sm text-on-surface-variant px-4">Only this PIN ends your walk safely. Keep it secret.</p>
                  </div>
                  <div className="flex justify-center gap-4">
                    {profileData.pin.map((digit, i) => (
                      <input
                        key={i}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => {
                          const newPin = [...profileData.pin];
                          newPin[i] = e.target.value.slice(-1);
                          setProfileData({ ...profileData, pin: newPin });
                          if (e.target.value && i < 3) {
                            document.getElementById(`profile-pin-${i + 1}`)?.focus();
                          }
                        }}
                        id={`profile-pin-${i}`}
                        className="w-14 h-16 text-center text-2xl font-bold bg-surface-container-lowest border border-outline-variant/30 rounded-2xl focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none text-primary"
                      />
                    ))}
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-6">
                  <button 
                    onClick={() => {
                      startWalk(profileData.defaultDuration);
                    }}
                    className="w-full bg-linear-to-br from-primary to-tertiary py-5 rounded-2xl text-on-primary font-headline font-bold text-lg tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3" 
                    type="button"
                  >
                    <ShieldCheck className="w-6 h-6" />
                    SAVE PROFILE
                  </button>
                  <p className="text-center text-[10px] text-on-surface-variant/40 mt-4 uppercase tracking-[0.2em] font-bold">Secured by Saahas Cloud Encryption</p>
                </div>
              </form>
            </main>

            {/* Success Toast Removed - Now Global */}

            {/* BottomNavBar */}
            <nav className="fixed bottom-0 left-0 w-full flex justify-around items-center px-4 pb-6 pt-3 bg-background/60 backdrop-blur-xl border-t border-outline-variant/10 z-50">
              <button 
                onClick={() => setCurrentScreen('landing')}
                className="flex flex-col items-center justify-center text-on-surface-variant hover:text-white transition-colors active:scale-90 duration-200"
              >
                <Home className="w-6 h-6" />
                <span className="font-body text-[10px] font-medium mt-1">Home</span>
              </button>
              <button className="flex flex-col items-center justify-center text-on-surface-variant hover:text-white transition-colors active:scale-90 duration-200">
                <Shield className="w-6 h-6" />
                <span className="font-body text-[10px] font-medium mt-1">Shield</span>
              </button>
              <button className="flex flex-col items-center justify-center text-on-surface-variant hover:text-white transition-colors active:scale-90 duration-200">
                <Bell className="w-6 h-6" />
                <span className="font-body text-[10px] font-medium mt-1">Alerts</span>
              </button>
              <button className="flex flex-col items-center justify-center text-primary font-bold active:scale-90 duration-200">
                <User className="w-6 h-6" fill="currentColor" fillOpacity={0.2} />
                <span className="font-body text-[10px] font-medium mt-1">Profile</span>
              </button>
            </nav>
          </motion.div>
        ) : currentScreen === 'active-walk' ? (
          <motion.div
            key="active-walk"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col bg-background relative overflow-hidden"
            onPointerDown={() => {
              setSosTapCount(prev => prev + 1);
              if (sosTapTimeout.current) clearTimeout(sosTapTimeout.current);
              sosTapTimeout.current = setTimeout(() => setSosTapCount(0), 3000);
              if (sosTapCount + 1 >= 10) {
                setIsAlertActive(true);
                setCurrentScreen('alert-sent');
              }
            }}
          >
            {/* Top Navigation Shell */}
            <header className="fixed top-0 w-full z-50 bg-background/60 backdrop-blur-xl flex justify-between items-center px-6 py-4 shadow-[0_0_20px_rgba(255,143,120,0.04)]">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    setShowCancelModal(true);
                    setCancelPinTimer(30);
                    setCancelPinAttempt('');
                    setCancelPinError(false);
                  }}
                  className="p-2 -ml-2 rounded-full hover:bg-white/5 transition-colors"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <span className="text-sm font-bold tracking-[0.2em] text-white uppercase font-headline">सAAहस</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-red-500/10 rounded-full border border-red-500/20">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                <span className="text-red-500 font-headline font-bold tracking-tight text-[10px] uppercase">LIVE</span>
              </div>
            </header>

            <main className="flex-1 flex flex-col pt-20 pb-32 px-6 max-w-md mx-auto w-full relative z-10">
              {/* Header Info */}
              <div className="text-center space-y-1 mb-6">
                <p className="text-on-surface-variant font-label text-[10px] uppercase tracking-[0.15em] font-bold">
                  Walk started {startTime} · {totalTime / 60} min walk
                </p>
              </div>

              {/* Status Badges Row 1 */}
              <div className="flex justify-center gap-2 mb-2">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${gpsStatus === 'live' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'}`}>
                  <MapPin className="w-3 h-3" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">{gpsStatus === 'live' ? 'GPS Live' : 'GPS Limited'}</span>
                </div>
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Footprints className="w-3 h-3" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Gait Monitor On</span>
                </div>
              </div>

              {/* Status Badges Row 2 */}
              <div className="flex justify-center gap-2 mb-8">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400">
                  <Users className="w-3 h-3" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">2 Contacts Ready</span>
                </div>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setCurrentScreen('shadow-mode')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400"
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">Shadow Mode Ready</span>
                </motion.button>
              </div>

              {/* Countdown Section */}
              <div className="flex-1 flex flex-col items-center justify-center">
                <div 
                  className="relative w-55 h-55 flex items-center justify-center cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTapCount(prev => prev + 1);
                    if (tapTimeout.current) clearTimeout(tapTimeout.current);
                    tapTimeout.current = setTimeout(() => setTapCount(0), 1500);
                    if (tapCount + 1 >= 3) {
                      setCurrentScreen('fake-call');
                    }
                  }}
                >
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 220 220">
                    <defs>
                      <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#FF8F78" />
                        <stop offset="100%" stopColor="#FF3B30" />
                      </linearGradient>
                    </defs>
                    <circle 
                      cx="110" cy="110" r="96" 
                      fill="transparent" 
                      stroke="#222" 
                      strokeWidth="8"
                    />
                    <motion.circle 
                      cx="110" cy="110" r="96" 
                      fill="transparent" 
                      stroke="url(#timerGradient)" 
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 96}
                      animate={{ strokeDashoffset: (2 * Math.PI * 96) * (1 - (timeLeft / totalTime)) }}
                      transition={{ duration: 1, ease: "linear" }}
                      style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                    />
                  </svg>
                  
                  <div className="text-center z-10">
                    {isBufferActive ? (
                      <div className="animate-pulse">
                        <span className="text-5xl font-black font-headline tracking-tighter text-red-500 tabular-nums">
                          {bufferTime}s
                        </span>
                        <p className="text-red-500/60 font-label text-[9px] uppercase tracking-[0.2em] mt-1 font-bold">Confirm Arrival!</p>
                      </div>
                    ) : (
                      <>
                        <span className="text-6xl font-black font-headline tracking-tighter text-white tabular-nums">
                          {formatTime(timeLeft)}
                        </span>
                        <p className="text-on-surface-variant font-label text-[9px] uppercase tracking-[0.2em] mt-1 font-bold">minutes remaining</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Location Bar */}
                <div className="mt-12 w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Navigation className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold mb-0.5">Current Location</p>
                    <p className="text-sm text-white font-medium truncate">{currentLocation}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Updated</p>
                    <p className="text-[10px] text-on-surface-variant font-medium">{lastLocationUpdate}s ago</p>
                  </div>
                </div>
              </div>

              {/* SOS/Arrived Action */}
              <div className="mt-auto pt-8">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPinAttempt([]);
                    setPinConfirmTimer(30);
                    setPinError(false);
                    setShowDismissWarning(false);
                    setCurrentScreen('pin-confirm');
                  }}
                  className="w-full py-5 arrived-safely-btn rounded-2xl bg-white text-black font-headline font-black text-lg tracking-tight shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-3"
                >
                  <UserCheck className="w-6 h-6" />
                  I ARRIVED SAFELY
                </motion.button>
              </div>
            </main>

            {/* Cancel Walk Modal */}
            <AnimatePresence>
              {showCancelModal && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-110 bg-black/85 backdrop-blur-md flex items-center justify-center px-6"
                >
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-[#1a1a1a] w-full max-w-sm rounded-[20px] p-6 text-center border border-[#222] shadow-2xl relative overflow-hidden"
                  >
                    {/* Warning Icon */}
                    <div className="flex justify-center mb-4">
                      <AlertTriangle className="w-8 h-8 text-[#FF6B00]" />
                    </div>

                    {/* Title & Subtext */}
                    <h3 className="text-xl font-bold text-white mb-2">Cancel your walk?</h3>
                    <p className="text-sm text-[#888] mb-6 leading-relaxed">
                      Enter your PIN to confirm you are safe.<br />
                      No PIN = walk stays active and protected.
                    </p>

                    {/* PIN Boxes */}
                    <div className="flex justify-center gap-3 mb-6">
                      {[0, 1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          animate={cancelPinError ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                          className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center transition-all duration-300 ${
                            cancelPinAttempt.length > i 
                            ? 'bg-white/5 border-white/20' 
                            : cancelPinAttempt.length === i 
                            ? 'bg-white/5 border-[#FF6B00]/50' 
                            : 'bg-white/5 border-white/10'
                          } ${cancelPinError ? 'border-red-500 bg-red-500/10' : ''}`}
                        >
                          {cancelPinAttempt.length > i && (
                            <div className="w-3 h-3 rounded-full bg-white" />
                          )}
                        </motion.div>
                      ))}
                    </div>

                    {cancelPinError && (
                      <p className="text-[#FF3B30] text-xs font-bold mb-4 animate-pulse">
                        Wrong PIN. Walk is still active.
                      </p>
                    )}

                    {/* Number Pad */}
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleCancelPinInput(num.toString())}
                          className="h-12 rounded-full bg-[#1a1a1a] hover:bg-[#333] active:scale-95 transition-all flex items-center justify-center text-lg font-bold text-white border border-white/5"
                        >
                          {num}
                        </button>
                      ))}
                      <div />
                      <button
                        onClick={() => handleCancelPinInput('0')}
                        className="h-12 rounded-full bg-[#1a1a1a] hover:bg-[#333] active:scale-95 transition-all flex items-center justify-center text-lg font-bold text-white border border-white/5"
                      >
                        0
                      </button>
                      <button
                        onClick={handleCancelPinBackspace}
                        className="h-12 rounded-full bg-[#1a1a1a] hover:bg-[#333] active:scale-95 transition-all flex items-center justify-center text-white border border-white/5"
                      >
                        <Delete className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Countdown Bar */}
                    <div className="w-full space-y-2 mb-4">
                      <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: '100%' }}
                          animate={{ width: `${(cancelPinTimer / 30) * 100}%` }}
                          transition={{ duration: 1, ease: "linear" }}
                          className="h-full bg-[#FF6B00] rounded-full"
                        />
                      </div>
                      <p className="text-center text-[10px] text-[#888] font-medium">
                        Walk stays active in <span className="text-white font-bold">{cancelPinTimer}</span> seconds
                      </p>
                    </div>

                    {/* Footer Text */}
                    <p className="text-[10px] text-[#444] italic leading-tight">
                      Lost your phone? Walk auto-alerts when<br />timer expires.
                    </p>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Walk Still Active Toast */}
            <AnimatePresence>
              {showActiveToast && (
                <motion.div 
                  initial={{ opacity: 0, y: 50, x: '-50%' }}
                  animate={{ opacity: 1, y: 0, x: '-50%' }}
                  exit={{ opacity: 0, y: 50, x: '-50%' }}
                  className="fixed bottom-32 left-1/2 bg-[#00C853]/10 border border-[#00C853] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-120"
                >
                  <ShieldCheck className="w-4 h-4 text-[#00C853]" />
                  <p className="font-label text-xs font-bold text-white whitespace-nowrap">Walk still active. You're protected.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Map Context Backdrop */}
            <div className="fixed inset-0 -z-10 opacity-20 pointer-events-none">
              <img 
                alt="Urban Map Context" 
                className="w-full h-full object-cover" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDQhAKJ7SOASaW214JKZ97rM0FqWKaYGi0ZGKyj5BOBRQ63Y6ZV7Xs17pVaR8PBPAAjjTdZE-PJDL53IisVA4CkYagN7MQXx7noiKgjKaL1jGcBvpHXZCNUZCRFuoU3uKM8FAWtJgaP0FrFSbggNC4yLJEVTYJpxO93qRHEpfC7Y-xcqgROXZfHGSO7bu9a_B861zSIS2nqsC3gEUBFyk7mKccb2A_inLmhimafbswL6PMPDzSsTb_Y3dHT2Hgxf4GABze0ENjFnEiN"
                referrerPolicy="no-referrer"
              />
            </div>
          </motion.div>
        ) : currentScreen === 'pin-confirm' ? (
          <motion.div
            key="pin-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-background flex flex-col px-6 py-12 relative overflow-hidden"
          >
            {/* Header */}
            <header className="flex justify-between items-center mb-12">
              <div className="w-10" />
              <h1 className="text-2xl font-bold text-white font-headline">Confirm Safe Arrival</h1>
              <button 
                onClick={() => {
                  setIsAlertActive(true);
                  setCurrentScreen('alert-sent');
                }}
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5 text-white/60" />
              </button>
            </header>

            {/* Icon Section */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative">
                <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full scale-150" />
                <div className="relative w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-10 h-10 text-emerald-400" />
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-lg font-medium text-white">Enter your secret PIN</h2>
              <p className="text-sm text-red-500 font-medium">Wrong PIN or no response = alert fires</p>
            </div>

            {/* Timer Bar */}
            <div className="w-full space-y-3 mb-12">
              <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: '100%' }}
                  animate={{ width: `${(pinConfirmTimer / 30) * 100}%` }}
                  transition={{ duration: 1, ease: "linear" }}
                  className={`h-full rounded-full ${pinConfirmTimer > 10 ? 'bg-orange-500' : 'bg-red-500'}`}
                />
              </div>
              <p className="text-center text-xs text-white/40 font-medium">
                Alert fires in <span className="text-white font-bold">{pinConfirmTimer}</span> seconds
              </p>
            </div>

            {/* PIN Boxes */}
            <div className="flex justify-center gap-3 mb-12">
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={pinError ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                  className={`w-16 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 ${
                    pinAttempt.length > i 
                    ? 'bg-white/5 border-white/20' 
                    : pinAttempt.length === i 
                    ? 'bg-white/5 border-orange-500/50 shadow-[0_0_20px_rgba(255,143,120,0.1)]' 
                    : 'bg-white/5 border-white/10'
                  } ${pinError ? 'border-red-500 bg-red-500/10' : ''}`}
                >
                  {pinAttempt.length > i && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                    />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Numeric Keypad */}
            <div className="mt-auto grid grid-cols-3 gap-4 max-w-xs mx-auto w-full pb-8">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button
                  key={num}
                  onClick={() => handlePinInput(num.toString())}
                  className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-2xl font-bold text-white font-headline"
                >
                  {num}
                </button>
              ))}
              <div />
              <button
                onClick={() => handlePinInput('0')}
                className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-2xl font-bold text-white font-headline"
              >
                0
              </button>
              <button
                onClick={handlePinBackspace}
                className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center text-white"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        ) : currentScreen === 'shadow-mode' ? (
          <motion.div
            id="screen-shadow-mode"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-background text-white flex flex-col font-body"
          >
            {/* Header */}
            <header className="pt-6 px-6 pb-4 flex flex-col items-center">
              <div className="flex items-center gap-2 mb-1">
                <motion.div
                  animate={{ scale: [0.9, 1.1, 0.9], opacity: [0.7, 1, 0.7] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="w-2.5 h-2.5 bg-[#FF6B00] rounded-full shadow-[0_0_10px_#FF6B00]"
                />
                <h2 className="text-[16px] font-bold text-[#FF6B00] tracking-tight uppercase font-headline">
                  SHADOW MODE ACTIVE
                </h2>
              </div>
              <p className="text-[13px] text-[#888] font-label">
                An anonymous guardian has been alerted
              </p>
            </header>

            {/* Map Section */}
            <div className="px-6 mb-6">
              <div className="relative w-full h-65 bg-[#0d1117] rounded-3xl overflow-hidden border border-[#333] shadow-2xl">
                {/* Simulated Map Background */}
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'radial-gradient(circle at 2px 2px, #333 1px, transparent 0)',
                    backgroundSize: '24px 24px'
                  }} />
                  <div className="absolute top-1/4 left-1/3 w-20 h-1 bg-[#222] rotate-45" />
                  <div className="absolute top-1/2 right-1/4 w-32 h-1 bg-[#222] -rotate-12" />
                  <div className="absolute bottom-1/4 left-1/2 w-40 h-1 bg-[#222] rotate-90" />
                </div>

                {/* User Location Dot & Ripple */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                  {/* Ripple Rings */}
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 1, opacity: 0.6 }}
                      animate={{ scale: 3, opacity: 0 }}
                      transition={{
                        repeat: Infinity,
                        duration: 3,
                        delay: i * 1,
                        ease: "easeOut"
                      }}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border border-[#FF3B3060]"
                    />
                  ))}
                  {/* Core Dot */}
                  <div className="w-4 h-4 bg-[#FF3B30] rounded-full shadow-[0_0_15px_#FF3B30] border-2 border-white relative z-10" />
                </div>

                {/* Scale Indicator */}
                <div className="absolute bottom-4 left-4 flex flex-col gap-1">
                  <div className="text-[10px] text-[#888] font-mono">0 ——— 500m</div>
                </div>

                {/* Live Badge */}
                <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full flex items-center gap-1.5 border border-white/10">
                  <div className="w-1.5 h-1.5 bg-[#00C853] rounded-full animate-pulse" />
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Live</span>
                </div>
              </div>
            </div>

            {/* Guardian Status Card */}
            <div className="px-6 mb-6">
              <AnimatePresence mode="wait">
                {guardianStatus === 'searching' && (
                  <motion.div
                    key="searching"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-[#1a1a1a] border border-[#333] rounded-3xl p-6 flex flex-col items-center text-center"
                  >
                    <div className="w-10 h-10 border-4 border-[#333] border-t-[#FF6B00] rounded-full animate-spin mb-4" />
                    <h3 className="text-[18px] font-bold text-white mb-1">Searching for nearby guardian...</h3>
                    <p className="text-[14px] text-[#888]">Searching within 2km</p>
                  </motion.div>
                )}

                {guardianStatus === 'found' && (
                  <motion.div
                    key="found"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`bg-[#1a1a1a] border ${guardianAcknowledged ? 'border-[#00C853]' : 'border-[#333]'} rounded-3xl p-6 flex flex-col items-center text-center shadow-[0_0_30px_rgba(0,200,83,0.1)] transition-colors duration-500`}
                  >
                    <div className="relative mb-4">
                      <Shield className="w-10 h-10 text-[#00C853]" />
                      <motion.div
                        animate={{ opacity: [0.2, 0.5, 0.2] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="absolute inset-0 bg-[#00C853] blur-xl rounded-full -z-10"
                      />
                    </div>
                    <h3 className="text-[18px] font-bold text-white mb-1">Guardian Found</h3>
                    <p className="text-[14px] text-[#888] mb-4">Someone nearby is watching your location</p>
                    
                    <div className="flex flex-col gap-2 w-full">
                      <div className="bg-black/20 rounded-xl py-2 px-4 flex items-center justify-center gap-2">
                        {guardianAcknowledged ? (
                          <>
                            <CheckCircle className="w-4 h-4 text-[#00C853]" />
                            <span className="text-[12px] font-bold text-[#00C853] uppercase tracking-wider">Watching Now</span>
                          </>
                        ) : (
                          <>
                            <div className="w-3 h-3 border-2 border-[#333] border-t-[#888] rounded-full animate-spin" />
                            <span className="text-[12px] font-bold text-[#888] uppercase tracking-wider">Awaiting Acknowledgment</span>
                          </>
                        )}
                      </div>
                      <p className="text-[12px] text-[#888] italic">No personal details shared. Fully anonymous.</p>
                    </div>
                  </motion.div>
                )}

                {guardianStatus === 'not-found' && (
                  <motion.div
                    key="not-found"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-[#1a1a1a] border border-[#FF6B00] rounded-3xl p-6 flex flex-col items-center text-center"
                  >
                    <AlertTriangle className="w-10 h-10 text-[#FF6B00] mb-4" />
                    <h3 className="text-[18px] font-bold text-white mb-1">No guardian available nearby</h3>
                    <p className="text-[14px] text-[#888]">Your contacts have been asked to call emergency services immediately</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* What Guardian Sees Card */}
            <div className="px-6 mb-8">
              <div className="bg-[#1a1a1a] border border-[#333] rounded-3xl p-5">
                <h4 className="text-[12px] font-bold text-[#888] uppercase tracking-widest mb-4 font-headline">
                  What the guardian sees:
                </h4>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-[13px] text-white">
                    <MapPin className="w-4 h-4 text-[#FF3B30]" />
                    <span>Your location dot only</span>
                  </li>
                  <li className="flex items-center gap-3 text-[13px] text-white">
                    <ShieldAlert className="w-4 h-4 text-[#FF6B00]" />
                    <span>One instruction: Watch and call 100</span>
                  </li>
                  <li className="flex items-center gap-3 text-[13px] text-white">
                    <X className="w-4 h-4 text-[#888]" />
                    <span>Not your name, photo or any details</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Emergency Fallback */}
            <div className="mt-auto px-6 pb-10 flex flex-col items-center">
              <p className="text-[13px] text-[#888] mb-4">If you are in immediate danger:</p>
              <a
                href="tel:112"
                className="w-full h-14 bg-[#1a1a1a] border border-[#333] rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-transform"
              >
                <div className="w-8 h-8 bg-[#FF3B30]/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-[#FF3B30]" />
                </div>
                <span className="text-[16px] font-bold text-white">Call 112 Now</span>
              </a>
              <button
                onClick={() => setCurrentScreen('active-walk')}
                className="mt-4 text-[12px] text-[#888] underline"
              >
                Back to Walk
              </button>
            </div>
          </motion.div>
        ) : currentScreen === 'fake-call' ? (
          <motion.div
            key="fake-call"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-[#080d14] flex flex-col items-center font-body text-white overflow-hidden"
          >
            {/* Status Bar */}
            <div className="w-full px-6 pt-3 flex justify-between items-center text-[12px] font-medium">
              <span>Jio</span>
              <span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              <div className="flex items-center gap-1">
                <div className="w-5 h-2.5 border border-white/40 rounded-sm relative">
                  <div className="absolute inset-0.5 bg-white rounded-sm w-[80%]" />
                </div>
              </div>
            </div>

            <div className="mt-15 flex flex-col items-center w-full">
              {!isCallInProgress ? (
                <>
                  <p className="text-[13px] text-[#888] mb-2 uppercase tracking-widest font-bold">Incoming Call</p>
                  <h1 className="text-[32px] font-bold mb-1">{profileData.guardianName || 'Mom'}</h1>
                  <p className="text-[14px] text-[#888] mb-12">Mobile</p>

                  {/* Avatar with Pulse */}
                  <div className="relative mb-24">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 1, opacity: 0.1 }}
                        animate={{ scale: 2.5, opacity: 0 }}
                        transition={{ repeat: Infinity, duration: 2.4, delay: i * 0.8 }}
                        className="absolute inset-0 bg-white rounded-full"
                      />
                    ))}
                    <div className="w-25 h-25 rounded-full bg-linear-to-br from-[#1a1a1a] to-[#333] border-[3px] border-[#333] flex items-center justify-center text-3xl font-bold relative z-10">
                      {(profileData.guardianName || 'Mom').charAt(0)}
                    </div>
                  </div>

                  {/* Middle Section */}
                  <div className="flex gap-12 mb-auto">
                    <div className="flex flex-col items-center gap-2 opacity-60">
                      <Clock className="w-6 h-6" />
                      <span className="text-[13px]">Remind Me</span>
                    </div>
                    <div className="flex flex-col items-center gap-2 opacity-60">
                      <Edit className="w-6 h-6" />
                      <span className="text-[13px]">Message</span>
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="w-full px-12 pb-20 flex justify-between items-end">
                    <div className="flex flex-col items-center gap-3">
                      <button
                        onClick={() => {
                          stopRingtone();
                          setCurrentScreen('fake-call-pin-confirm');
                        }}
                        className="w-18 h-18 rounded-full bg-[#FF3B30] flex items-center justify-center active:scale-90 transition-transform shadow-lg"
                      >
                        <PhoneOff className="w-7 h-7 text-white" />
                      </button>
                      <span className="text-[12px] font-medium">Decline</span>
                    </div>

                    <div className="flex flex-col items-center gap-3">
                      <button
                        onClick={() => {
                          stopRingtone();
                          setIsCallInProgress(true);
                          // Start 5 minute hidden countdown
                          fakeCallAlertTimeout.current = setTimeout(() => {
                            setCurrentScreen('alert-sent');
                          }, 300000);
                        }}
                        className="w-18 h-18 rounded-full bg-[#00C853] flex items-center justify-center active:scale-90 transition-transform shadow-lg"
                      >
                        <Phone className="w-7 h-7 text-white" />
                      </button>
                      <span className="text-[12px] font-medium text-[#00C853]">Answer</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <h1 className="text-[32px] font-bold mb-1 mt-10">{profileData.guardianName || 'Mom'}</h1>
                  <p className="text-[18px] text-[#00C853] font-mono mb-20">{formatCallTime(callDuration)}</p>

                  {/* In-Call Controls */}
                  <div className="grid grid-cols-3 gap-x-12 gap-y-10 mb-20">
                    {[
                      { icon: Mic, label: 'mute' },
                      { icon: Users, label: 'keypad' },
                      { icon: Volume2, label: 'speaker' },
                      { icon: Plus, label: 'add call' },
                      { icon: Activity, label: 'FaceTime' },
                      { icon: User, label: 'contacts' }
                    ].map((item, i) => (
                      <div key={i} className="flex flex-col items-center gap-2 opacity-40">
                        <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center">
                          <item.icon className="w-6 h-6" />
                        </div>
                        <span className="text-[12px] capitalize">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* End Call Button */}
                  <div className="mt-auto pb-20">
                    <button
                      onClick={() => {
                        setIsCallInProgress(false);
                        setCurrentScreen('fake-call-pin-confirm');
                      }}
                      className="w-18 h-18 rounded-full bg-[#FF3B30] flex items-center justify-center active:scale-90 transition-transform shadow-lg"
                    >
                      <PhoneOff className="w-7 h-7 text-white" />
                    </button>
                  </div>
                </>
              )}
            </div>

            <p className="absolute bottom-6 text-[10px] text-[#222] uppercase tracking-widest font-bold">saahas active</p>
          </motion.div>
        ) : currentScreen === 'fake-call-pin-confirm' ? (
          <motion.div
            key="fake-call-pin-confirm"
            initial={{ opacity: 0, backgroundColor: '#080d14' }}
            animate={{ opacity: 1, backgroundColor: '#0a0a0a' }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="min-h-screen flex flex-col items-center pt-20 px-8 relative overflow-hidden"
          >
            {/* Header Shield */}
            <motion.div
              animate={fakeCallPinSuccess ? { scale: [1, 1.2, 1], color: '#00C853' } : {}}
              className="relative mb-8"
            >
              {fakeCallPinSuccess && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1.5 }}
                  className="absolute inset-0 bg-[#00C853]/20 blur-2xl rounded-full"
                />
              )}
              <Shield className={`w-10 h-10 ${fakeCallPinSuccess ? 'text-[#00C853]' : 'text-white'} relative z-10`} />
            </motion.div>

            <h2 className="text-2xl font-bold text-white mb-4">Are you safe?</h2>
            
            <p className="text-sm text-[#888] text-center max-w-70 mb-12 leading-relaxed">
              {fakeCallPinSuccess 
                ? "Stay safe. Walk resumed."
                : fakeCallPinError 
                  ? "Incorrect PIN."
                  : "Enter your secret PIN to confirm. No response in 30 seconds = alert fires."
              }
            </p>

            {/* Countdown Bar */}
            {!fakeCallPinSuccess && !fakeCallPinError && (
              <div className="w-full mb-12">
                <div className="w-full h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: `${(fakeCallPinTimer / 30) * 100}%` }}
                    transition={{ duration: 1, ease: 'linear' }}
                    className="h-full"
                    style={{
                      backgroundColor: fakeCallPinTimer > 10 ? '#FF6B00' : '#FF3B30'
                    }}
                  />
                </div>
                <p className="text-[13px] text-[#888] text-center mt-3">
                  Alert fires in {fakeCallPinTimer} seconds
                </p>
              </div>
            )}

            {/* PIN Boxes */}
            <motion.div 
              animate={fakeCallPinError ? { x: [-10, 10, -10, 10, 0] } : {}}
              className="flex gap-3 mb-16"
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`w-16 h-18 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 ${
                    fakeCallPinError 
                      ? 'border-[#FF3B30] bg-[#FF3B30]/10' 
                      : fakeCallPinSuccess 
                        ? 'border-[#00C853] bg-[#00C853]/10'
                        : fakeCallPinAttempt.length > i 
                          ? 'border-[#FF6B00] bg-[#1a1a1a]' 
                          : 'border-[#333] bg-[#1a1a1a]'
                  }`}
                >
                  {fakeCallPinSuccess ? (
                    <CheckCircle className="w-8 h-8 text-[#00C853]" />
                  ) : fakeCallPinAttempt.length > i ? (
                    <div className="w-3 h-3 rounded-full bg-white" />
                  ) : null}
                </div>
              ))}
            </motion.div>

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-x-8 gap-y-6 mt-auto pb-12">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0].map((num) => (
                <button
                  key={num}
                  onClick={() => handleFakeCallPinInput(num.toString())}
                  className="w-14 h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center text-xl font-medium text-white active:bg-[#333] transition-colors"
                >
                  {num}
                </button>
              ))}
              <button
                onClick={handleFakeCallPinBackspace}
                className="w-14 h-14 rounded-full bg-[#1a1a1a] flex items-center justify-center text-white active:bg-[#333] transition-colors"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>
          </motion.div>
        ) : currentScreen === 'alert-sent' ? (
          <motion.div
            key="alert-sent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-red-600 flex flex-col items-center justify-center p-8 text-center"
          >
            <motion.div 
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-8"
            >
              <ShieldAlert className="w-12 h-12 text-white" />
            </motion.div>
            <h1 className="text-4xl font-black text-white mb-4 uppercase tracking-tighter italic">Alert Sent!</h1>
            {alertTriggerReason && (
              <p className="text-white/60 text-xs uppercase tracking-widest mb-4 font-bold">
                Reason: {alertTriggerReason}
              </p>
            )}
            <p className="text-white/80 text-lg mb-12 font-medium leading-relaxed">
              Your emergency contacts and local authorities have been notified with your live location.
            </p>
            <button 
              onClick={() => setCurrentScreen('active-walk')}
              className="px-10 py-4 bg-white text-red-600 rounded-2xl font-black text-sm uppercase tracking-widest"
            >
              Cancel Alert
            </button>
          </motion.div>
        ) : currentScreen === 'walk-complete' ? (
          <motion.div
            key="walk-complete"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex flex-col bg-background relative overflow-hidden"
          >
            {/* Top Navigation Shell */}
            <header className="fixed top-0 w-full z-50 bg-background/60 backdrop-blur-xl flex justify-between items-center px-6 py-4 shadow-[0_0_20px_rgba(255,143,120,0.04)]">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tracking-[0.2em] text-white uppercase font-headline">सAAहस</span>
              </div>
              <Bell className="w-6 h-6 text-on-surface-variant" />
            </header>

            <main className="grow pt-24 pb-12 px-6 flex flex-col items-center max-w-md mx-auto w-full relative z-10">
              {/* Success State */}
              <div className="mb-10 text-center space-y-4">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-emerald-500/20 blur-3xl rounded-full"></div>
                  <div className="relative w-24 h-24 bg-surface-container-highest rounded-full flex items-center justify-center border border-emerald-500/30">
                    <CheckCircle className="w-12 h-12 text-green-400" />
                  </div>
                </div>
                <div className="space-y-2">
                  <h2 className="font-headline text-3xl font-bold text-white tracking-tight">You Arrived Safely</h2>
                  <p className="font-body text-on-surface-variant text-base">Your contacts have been notified.</p>
                </div>
              </div>

              {/* Summary Card */}
              <section className="w-full space-y-6">
                <div className="bg-surface-container-low rounded-4xl p-8 space-y-8 shadow-2xl relative overflow-hidden group border border-outline-variant/10">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[60px] rounded-full -mr-16 -mt-16"></div>
                  <h3 className="font-label text-[10px] font-medium uppercase tracking-widest text-on-surface-variant">Walk Summary</h3>
                  
                  <div className="grid grid-cols-2 gap-y-8 gap-x-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-primary">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="font-label text-[10px] uppercase tracking-wider font-semibold">Duration</span>
                      </div>
                      <p className="text-2xl font-headline font-bold text-white">{walkSummary.duration}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="font-label text-[10px] uppercase tracking-wider font-semibold">Distance</span>
                      </div>
                      <p className="text-2xl font-headline font-bold text-white">{walkSummary.distance}</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sky-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span className="font-label text-[10px] uppercase tracking-wider font-semibold">Security</span>
                      </div>
                      <p className="text-2xl font-headline font-bold text-white">100%</p>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-amber-400">
                        <Footprints className="w-3.5 h-3.5" />
                        <span className="font-label text-[10px] uppercase tracking-wider font-semibold">Steps</span>
                      </div>
                      <p className="text-2xl font-headline font-bold text-white">{walkSummary.steps}</p>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => setCurrentScreen('landing')}
                  className="w-full py-5 rounded-2xl bg-white text-black font-headline font-black text-lg tracking-tight shadow-xl active:scale-[0.98] transition-all"
                >
                  BACK TO HOME
                </button>
              </section>
            </main>
          </motion.div>
        ) : currentScreen === 'guest-setup' ? (
          <motion.div
            key="guest-setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen flex flex-col bg-[#050608] relative"
          >
            {/* Decorative Background */}
            <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[40%] bg-[#FF8A65]/5 blur-[120px] rounded-full -z-10" />
            <div className="fixed bottom-[10%] left-[-20%] w-[60%] h-[40%] bg-[#FFB74D]/5 blur-[120px] rounded-full -z-10" />

            {/* Header Section */}
            <header className="px-6 pt-8 pb-6 flex items-center justify-between sticky top-0 z-10 bg-[#050608]/80 backdrop-blur-xl">
              <button 
                onClick={() => setCurrentScreen('landing')}
                className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors active:scale-95 duration-200"
              >
                <ArrowLeft className="w-6 h-6 text-white" />
              </button>
              <h1 className="font-bold text-2xl tracking-tight text-white">Quick Setup</h1>
              <div className="w-10 h-10" />
            </header>

            <main className="flex-1 px-6 pb-32 overflow-y-auto">
              <div className="space-y-8 max-w-md mx-auto">
                {/* Title */}
                <div className="text-center space-y-2 mb-12">
                  <p className="text-sm text-gray-400 uppercase tracking-widest font-bold">Takes 30 seconds</p>
                  <h2 className="text-3xl font-bold text-white">Ready to walk?</h2>
                </div>

                {/* Your Name */}
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-white uppercase tracking-wider">Your Name</label>
                  <input 
                    type="text" 
                    placeholder="Aditya"
                    value={guestData.name}
                    onChange={(e) => setGuestData({ ...guestData, name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-gray-500 focus:border-[#FF8A65]/50 focus:outline-none transition-all"
                  />
                </div>

                {/* Emergency Contacts */}
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-white uppercase tracking-wider">Emergency Contact 1</label>
                  <input 
                    type="tel" 
                    placeholder="+91 XXXXXXXXXX"
                    value={guestData.contact1}
                    onChange={(e) => setGuestData({ ...guestData, contact1: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-gray-500 focus:border-[#FF8A65]/50 focus:outline-none transition-all"
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-bold text-white uppercase tracking-wider">Emergency Contact 2</label>
                  <input 
                    type="tel" 
                    placeholder="+91 XXXXXXXXXX"
                    value={guestData.contact2}
                    onChange={(e) => setGuestData({ ...guestData, contact2: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder:text-gray-500 focus:border-[#FF8A65]/50 focus:outline-none transition-all"
                  />
                </div>

                {/* PIN Creation */}
                <div className="space-y-3 pt-4">
                  <div className="flex justify-between items-center">
                    <label className="text-sm font-bold text-white uppercase tracking-wider">Safety PIN</label>
                    <p className="text-[10px] text-gray-400">(4 digits)</p>
                  </div>
                  <p className="text-xs text-gray-400 mb-3">Keep this secret. It ends your walk safely.</p>
                  <div className="flex justify-between gap-3 max-w-xs">
                    {guestData.pin.map((digit, i) => (
                      <input
                        key={i}
                        id={`pin-${i}`}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleGuestPinChange(i, e.target.value)}
                        className="w-16 h-16 bg-white/5 border border-white/10 rounded-lg text-center text-2xl font-bold text-white focus:border-[#FF8A65]/50 focus:outline-none transition-all"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </main>

            {/* Bottom Action */}
            <footer className="fixed bottom-0 left-0 right-0 p-6 bg-linear-to-t from-[#050608] via-[#050608] to-transparent">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => startWalk(guestData.duration)}
                className="w-full py-4 rounded-lg bg-linear-to-r from-[#FF8A65] to-[#FFB74D] text-black font-bold text-lg shadow-[0_20px_50px_-10px_rgba(255,138,101,0.6)] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                START WALKING
                <ArrowRight className="w-5 h-5" strokeWidth={3} />
              </motion.button>
            </footer>
          </motion.div>
        ) : currentScreen === 'registered-user' ? (
          <motion.div
            key="registered-user"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen flex flex-col bg-[#050608] relative"
          >
            {/* Decorative Background */}
            <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[40%] bg-[#FF8A65]/5 blur-[120px] rounded-full -z-10" />
            <div className="fixed bottom-[10%] left-[-20%] w-[60%] h-[40%] bg-[#FFB74D]/5 blur-[120px] rounded-full -z-10" />

            {/* Header */}
            <header className="px-6 pt-8 pb-8 flex items-center justify-between sticky top-0 z-10 bg-[#050608]/80 backdrop-blur-xl">
              <button 
                onClick={() => setCurrentScreen('landing')}
                className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors active:scale-95 duration-200"
              >
                <ArrowLeft className="w-6 h-6 text-white" />
              </button>
              <h1 className="font-bold text-2xl tracking-tight text-white">Saahas</h1>
              <button 
                onClick={() => setCurrentScreen('profile-setup')}
                className="p-2 rounded-full hover:bg-white/10 transition-colors active:scale-95"
              >
                <User className="w-6 h-6 text-white" />
              </button>
            </header>

            <main className="flex-1 px-6 pb-32 overflow-y-auto flex flex-col items-center justify-center">
              {/* Welcome Message */}
              <div className="text-center space-y-2 mb-16">
                <p className="text-sm text-gray-400 uppercase tracking-widest font-bold">Welcome back</p>
                <h2 className="text-4xl font-bold text-white">{registeredUserName}</h2>
              </div>

              {/* Duration Selection */}
              <div className="w-full max-w-md space-y-6">
                <div className="space-y-4">
                  <p className="text-sm font-bold text-white uppercase tracking-wider">Walk Duration</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[5, 10, 15, 30].map((min) => (
                      <button
                        key={min}
                        onClick={() => setGuestData({ ...guestData, duration: min, isCustom: false })}
                        className={`py-5 rounded-lg border-2 transition-all active:scale-95 text-lg font-bold ${
                          !guestData.isCustom && guestData.duration === min 
                            ? 'bg-[#FF8A65] border-[#FF8A65] text-black shadow-[0_0_30px_rgba(255,138,101,0.4)]' 
                            : 'bg-white/5 border-white/10 text-white hover:border-[#FF8A65]/50'
                        }`}
                      >
                        {min} min
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setGuestData({ ...guestData, isCustom: true })}
                    className={`w-full py-4 rounded-lg border-2 transition-all active:scale-95 text-base font-bold ${
                      guestData.isCustom 
                        ? 'bg-[#FF8A65] border-[#FF8A65] text-black shadow-[0_0_30px_rgba(255,138,101,0.4)]' 
                        : 'bg-white/5 border-white/10 text-white hover:border-[#FF8A65]/50'
                    }`}
                  >
                    Custom Duration
                  </button>

                  {/* Custom Time Input */}
                  <AnimatePresence>
                    {guestData.isCustom && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 flex items-center gap-3 p-4 bg-white/5 rounded-lg border border-white/10">
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              min="0" 
                              max="23"
                              value={guestData.customHours}
                              onChange={(e) => setGuestData({ ...guestData, customHours: parseInt(e.target.value) || 0 })}
                              className="w-12 h-10 bg-white/5 border border-white/10 rounded text-center font-bold text-white focus:outline-none"
                            />
                            <span className="text-white">h</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" 
                              min="0" 
                              max="59"
                              value={guestData.customMinutes}
                              onChange={(e) => setGuestData({ ...guestData, customMinutes: parseInt(e.target.value) || 0 })}
                              className="w-12 h-10 bg-white/5 border border-white/10 rounded text-center font-bold text-white focus:outline-none"
                            />
                            <span className="text-white">m</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </main>

            {/* Bottom Action */}
            <footer className="fixed bottom-0 left-0 right-0 p-6 bg-linear-to-t from-[#050608] via-[#050608] to-transparent">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const duration = guestData.isCustom 
                    ? (guestData.customHours * 60) + guestData.customMinutes 
                    : guestData.duration;
                  startWalk(duration);
                }}
                className="w-full py-4 rounded-lg bg-linear-to-r from-[#FF8A65] to-[#FFB74D] text-black font-bold text-lg shadow-[0_20px_50px_-10px_rgba(255,138,101,0.6)] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                START WALKING
                <ArrowRight className="w-5 h-5" strokeWidth={3} />
              </motion.button>
            </footer>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}