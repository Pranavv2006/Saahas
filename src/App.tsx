/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Shield, MapPin, Bell, Users, ChevronRight, ArrowRight, Footprints, ArrowLeft, Home, User, Edit, CheckCircle, ChevronDown, Search, ShieldCheck, AlertTriangle, X, Menu, Clock, Ruler, Activity, HeartPulse, Camera, Plus, Trash2, Navigation, UserCheck, ShieldAlert, Delete, Phone, PhoneOff, Mic, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useRef } from 'react';

type Screen = 'landing' | 'guest-setup' | 'profile-setup' | 'active-walk' | 'walk-complete' | 'fake-call' | 'alert-sent' | 'pin-confirm' | 'shadow-mode' | 'fake-call-pin-confirm';
type GaitBadgeStatus = 'active' | 'anomaly' | 'unavailable';
type GaitAlertType = 'person_fell' | 'phone_fallen' | 'struggle_detected' | 'sudden_stop' | 'extreme_deviation' | 'prolonged_still';

type GaitReading = {
  time: number;
  x: number;
  y: number;
  z: number;
  magnitude: number;
  rotationAlpha: number;
  rotationBeta: number;
  rotationGamma: number;
  interval: number;
};

type GaitBaseline = {
  avg: number;
  std: number;
  min: number;
  max: number;
  stepsPerMinute: number;
  upperThreshold: number;
  lowerThreshold: number;
  rawSamples: number;
};

type LiveLocationPoint = {
  lat: number;
  lng: number;
  time: number;
  label?: string;
};

type ShadowAlertStatus = {
  status: 'idle' | 'waiting_ack' | 'acknowledged' | 'shadow_active' | 'cancelled';
  shadowModeActive: boolean;
  automaticSosTriggered: boolean;
  ackDeadlineAt: number | null;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  nearbyUsersNotified: number;
};

type GaitDataStore = {
  readings: GaitReading[];
  baselineMagnitudes: number[];
  baseline: GaitBaseline | null;
  isBaselineReady: boolean;
  anomalyStartTime: number | null;
  anomalyActive: boolean;
  lastReadingTime: number | null;
  phoneStillCount: number;
  fallDetected: boolean;
  struggleDetected: boolean;
  readingCount: number;
  anomalyType: GaitAlertType | null;
};

type SaahasRuntime = {
  walk: {
    gaitData: GaitDataStore | null;
    gaitStartTime: number | null;
    gaitListener: ((event: DeviceMotionEvent) => void) | null;
    gaitListenerAttached: boolean;
    gaitPaused: boolean;
  };
  alert: {
    fired: boolean;
    trigger: string | null;
    gaitType: GaitAlertType | null;
    gaitReason: string | null;
    gaitData: Record<string, unknown> | null;
    messageBody: string | null;
  };
};

export default function App() {
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
  const [fakeCallWrongPinBufferActive, setFakeCallWrongPinBufferActive] = useState(false);
  const [fakeCallWrongPinTimer, setFakeCallWrongPinTimer] = useState(30);
  const [alertTriggerReason, setAlertTriggerReason] = useState<string | null>(null);
  const fakeCallAlertTimeout = useRef<NodeJS.Timeout | null>(null);
  const fakeCallPinInterval = useRef<NodeJS.Timeout | null>(null);
  const fakeCallPinResetTimeout = useRef<NodeJS.Timeout | null>(null);
  const fakeCallPinSuccessTimeout = useRef<NodeJS.Timeout | null>(null);
  const ringtoneOscillator = useRef<OscillatorNode | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const [shadowAlertStatus, setShadowAlertStatus] = useState<ShadowAlertStatus>({
    status: 'idle',
    shadowModeActive: false,
    automaticSosTriggered: false,
    ackDeadlineAt: null,
    acknowledgedAt: null,
    acknowledgedBy: null,
    nearbyUsersNotified: 0,
  });
  useEffect(() => {
    if (currentScreen !== 'shadow-mode') {
      return;
    }

    if (shadowAlertStatus.status === 'acknowledged') {
      setGuardianStatus('found');
      setGuardianAcknowledged(true);
      return;
    }

    if (shadowAlertStatus.status === 'shadow_active') {
      const nearbyUsersFound = shadowAlertStatus.nearbyUsersNotified > 0;
      setGuardianStatus(nearbyUsersFound ? 'found' : 'not-found');
      setGuardianAcknowledged(nearbyUsersFound);
      return;
    }

    setGuardianStatus('searching');
    setGuardianAcknowledged(false);
    setShadowModeSearchTime(0);

    const searchInterval = setInterval(() => {
      setShadowModeSearchTime(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(searchInterval);
    };
  }, [currentScreen, shadowAlertStatus]);

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
      setFakeCallWrongPinBufferActive(false);
      setFakeCallWrongPinTimer(30);
      if (fakeCallPinResetTimeout.current) clearTimeout(fakeCallPinResetTimeout.current);
      if (fakeCallPinSuccessTimeout.current) clearTimeout(fakeCallPinSuccessTimeout.current);
    } else {
      if (fakeCallPinInterval.current) clearInterval(fakeCallPinInterval.current);
      if (fakeCallPinResetTimeout.current) clearTimeout(fakeCallPinResetTimeout.current);
      if (fakeCallPinSuccessTimeout.current) clearTimeout(fakeCallPinSuccessTimeout.current);
    }
    return () => {
      if (fakeCallPinInterval.current) clearInterval(fakeCallPinInterval.current);
      if (fakeCallPinResetTimeout.current) clearTimeout(fakeCallPinResetTimeout.current);
      if (fakeCallPinSuccessTimeout.current) clearTimeout(fakeCallPinSuccessTimeout.current);
    };
  }, [currentScreen]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentScreen === 'fake-call-pin-confirm' && fakeCallPinTimer > 0 && !fakeCallPinSuccess) {
      interval = setInterval(() => {
        setFakeCallPinTimer((prev) => prev - 1);
      }, 1000);
    } else if (currentScreen === 'fake-call-pin-confirm' && fakeCallPinTimer === 0 && !fakeCallPinSuccess && !fakeCallWrongPinBufferActive) {
      clearFakeCallAlert();
      if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
      setAlertTriggerReason('fake_call_no_response');
      setCurrentScreen('alert-sent');
    }
    return () => clearInterval(interval);
  }, [currentScreen, fakeCallPinTimer, fakeCallPinSuccess, fakeCallWrongPinBufferActive]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentScreen === 'fake-call-pin-confirm' && fakeCallWrongPinBufferActive && fakeCallWrongPinTimer > 0 && !fakeCallPinSuccess) {
      interval = setInterval(() => {
        setFakeCallWrongPinTimer((prev) => prev - 1);
      }, 1000);
    } else if (currentScreen === 'fake-call-pin-confirm' && fakeCallWrongPinBufferActive && fakeCallWrongPinTimer === 0 && !fakeCallPinSuccess) {
      clearFakeCallAlert();
      if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
      setAlertTriggerReason('fake_call_wrong_pin');
      setCurrentScreen('alert-sent');
    }
    return () => clearInterval(interval);
  }, [currentScreen, fakeCallWrongPinBufferActive, fakeCallWrongPinTimer, fakeCallPinSuccess]);

  const handleFakeCallPinInput = (digit: string) => {
    if (fakeCallPinAttempt.length < 4 && !fakeCallPinError && !fakeCallPinSuccess) {
      const newAttempt = fakeCallPinAttempt + digit;
      setFakeCallPinAttempt(newAttempt);

      if (newAttempt.length === 4) {
        const correctPin = guestData.pin.join('') || profileData.pin.join('');
        if (newAttempt === correctPin) {
          if (fakeCallPinResetTimeout.current) clearTimeout(fakeCallPinResetTimeout.current);
          if (fakeCallPinSuccessTimeout.current) clearTimeout(fakeCallPinSuccessTimeout.current);
          clearFakeCallAlert();
          setFakeCallPinSuccess(true);
          setFakeCallPinError(false);
          setFakeCallWrongPinBufferActive(false);
          setAlertTriggerReason(null);
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          fakeCallPinSuccessTimeout.current = setTimeout(() => {
            resumeGaitGhost();
            setCurrentScreen('active-walk');
          }, 1000);
        } else {
          if (fakeCallPinResetTimeout.current) clearTimeout(fakeCallPinResetTimeout.current);
          setFakeCallPinError(true);
          if (!fakeCallWrongPinBufferActive) {
            setFakeCallWrongPinBufferActive(true);
            setFakeCallWrongPinTimer(30);
          }
          if (navigator.vibrate) navigator.vibrate([500]);
          fakeCallPinResetTimeout.current = setTimeout(() => {
            setFakeCallPinAttempt('');
            setFakeCallPinError(false);
          }, 2000);
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
  const [loggedInUserName, setLoggedInUserName] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [startTime, setStartTime] = useState<string>('');
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [confirmationPin, setConfirmationPin] = useState(['', '', '', '']);
  const [pinTimeout, setPinTimeout] = useState(60);
  const [pinModalWrongPinBufferActive, setPinModalWrongPinBufferActive] = useState(false);
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
  const [cancelPinAlertBufferActive, setCancelPinAlertBufferActive] = useState(false);
  const [cancelPinWrongAttemptCount, setCancelPinWrongAttemptCount] = useState(0);
  const [showActiveToast, setShowActiveToast] = useState(false);
  const [pinAttempt, setPinAttempt] = useState<string[]>([]);
  const [pinConfirmTimer, setPinConfirmTimer] = useState(30);
  const [pinError, setPinError] = useState(false);
  const [pinBufferActive, setPinBufferActive] = useState(false);
  const [pinSuccess, setPinSuccess] = useState(false);
  const [pinWrongAttemptCount, setPinWrongAttemptCount] = useState(0);
  const [showDismissWarning, setShowDismissWarning] = useState(false);
  const breadcrumbs = useRef<{ lat: number; lng: number; time: number }[]>([]);
  const latestLocationRef = useRef<LiveLocationPoint | null>(null);
  const lastLocationSyncAt = useRef(0);
  const wakeLock = useRef<any>(null);
  const tapTimeout = useRef<NodeJS.Timeout | null>(null);
  const sosTapTimeout = useRef<NodeJS.Timeout | null>(null);
  const overdueNotificationSentWalkId = useRef<string | null>(null);
  const pinErrorResetTimeout = useRef<NodeJS.Timeout | null>(null);
  const pinSuccessTimeout = useRef<NodeJS.Timeout | null>(null);
  const cancelPinResetTimeout = useRef<NodeJS.Timeout | null>(null);
  const alertNotificationSentKey = useRef<string | null>(null);
  const safeArrivalNotificationSentKey = useRef<string | null>(null);
  const safeArrivalNotificationPendingKey = useRef<string | null>(null);
  const pinModalResetTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const savedLoggedInUserName = localStorage.getItem('saahas_logged_in_profile_name');
    if (savedLoggedInUserName) {
      setLoggedInUserName(savedLoggedInUserName);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (pinModalResetTimeout.current) clearTimeout(pinModalResetTimeout.current);
    };
  }, []);

  const getSaahasState = (): SaahasRuntime => {
    const globalWindow = window as Window & { SAAHAS?: SaahasRuntime };

    if (!globalWindow.SAAHAS) {
      globalWindow.SAAHAS = {
        walk: {
          gaitData: null,
          gaitStartTime: null,
          gaitListener: null,
          gaitListenerAttached: false,
          gaitPaused: false,
        },
        alert: {
          fired: false,
          trigger: null,
          gaitType: null,
          gaitReason: null,
          gaitData: null,
          messageBody: null,
        },
      };
    }

    return globalWindow.SAAHAS;
  };

  const navigateTo = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const getCurrentUserName = () => guestData.name || profileData.fullName || 'User';

  const getCurrentUserPhone = () => guestData.phone || profileData.phone || '';

  const syncProfileLocation = (location: LiveLocationPoint, currentWalkId?: string | null) => {
    const userPhone = getCurrentUserPhone();
    if (!userPhone) return;

    const now = Date.now();
    if (now - lastLocationSyncAt.current < 15000) return;

    lastLocationSyncAt.current = now;

    fetch('/api/profile/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: getCurrentUserName(),
        userPhone,
        lat: location.lat,
        lng: location.lng,
        label: location.label || currentLocation,
        walkId: currentWalkId || walkId,
      }),
    }).catch((error) => {
      console.error('Profile location sync failed:', error);
    });
  };

  const updateGaitBadge = (status: GaitBadgeStatus) => {
    const badge = document.getElementById('badge-gait');
    if (!badge) return;

    const badgeLabel = badge.querySelector('[data-gait-label]');

    if (status === 'active') {
      if (badgeLabel) badgeLabel.textContent = 'Gait Monitor On';
      badge.style.background = 'rgba(0,200,83,0.12)';
      badge.style.color = '#00C853';
      badge.style.borderColor = 'rgba(0,200,83,0.2)';
    } else if (status === 'anomaly') {
      if (badgeLabel) badgeLabel.textContent = 'Anomaly Detected';
      badge.style.background = 'rgba(255,107,0,0.12)';
      badge.style.color = '#FF6B00';
      badge.style.borderColor = 'rgba(255,107,0,0.2)';
    } else {
      if (badgeLabel) badgeLabel.textContent = 'Gait Unavailable';
      badge.style.background = 'rgba(136,136,136,0.12)';
      badge.style.color = '#888888';
      badge.style.borderColor = 'rgba(136,136,136,0.2)';
    }
  };

  const buildMapsLink = (point?: { lat: number; lng: number }) => {
    if (!point) return 'Unavailable';
    return `https://maps.google.com/?q=${point.lat},${point.lng}`;
  };

  const getEmergencyContacts = () => {
    return [
      {
        name: profileData.contact1Name || 'Emergency Contact 1',
        phone: guestData.contact1 || profileData.contact1Phone,
      },
      {
        name: profileData.contact2Name || 'Emergency Contact 2',
        phone: guestData.contact2 || profileData.contact2Phone,
      },
    ].filter((contact) => Boolean(contact.phone));
  };

  const getReadableAlertReason = (reason?: string | null) => {
    const alertReasonMap: Record<string, string> = {
      fake_call_no_response: 'No response after fake call safety check',
      fake_call_wrong_pin: 'Wrong PIN detected after fake call',
      fake_call_hidden_timeout: 'No safety confirmation after fake call',
      wrong_pin_timeout: 'Safe arrival PIN was not confirmed',
      back_button_wrong_pin: 'Wrong PIN entered while leaving the walk',
      walk_timer_buffer_expired: 'Walk timer expired without safe arrival confirmation',
      pin_confirm_backgrounded: 'Safe arrival confirmation was interrupted',
      pin_confirm_closed: 'Safe arrival confirmation was closed',
      manual_sos_triggered: 'Manual SOS was triggered',
      pin_modal_timeout: 'Safety confirmation PIN timed out',
      pin_modal_wrong_pin: 'Wrong safety confirmation PIN entered',
    };

    if (!reason) return 'Emergency alert triggered';
    return alertReasonMap[reason] || reason;
  };

  const buildEmergencyAlertMessage = (reasonText: string, detectedBy = 'Saahas Safety App') => {
    const userName = getCurrentUserName();
    const currentPoint = latestLocationRef.current || breadcrumbs.current[breadcrumbs.current.length - 1];
    const twoMinutesAgoPoint = [...breadcrumbs.current].reverse().find((point) => Date.now() - point.time >= 120000);
    const fourMinutesAgoPoint = [...breadcrumbs.current].reverse().find((point) => Date.now() - point.time >= 240000);
    const currentLocationLink = buildMapsLink(currentPoint);
    const twoMinutesAgoLink = buildMapsLink(twoMinutesAgoPoint);
    const fourMinutesAgoLink = buildMapsLink(fourMinutesAgoPoint);

    return `🚨 SAAHAS ALERT 🚨
${userName} may be in danger.
Reason: ${reasonText}

📍 Current location:
${currentLocationLink === 'Unavailable' ? currentLocation : currentLocationLink}

📍 2 min ago: ${twoMinutesAgoLink}
📍 4 min ago: ${fourMinutesAgoLink}

⏰ Time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
📱 Detected by: ${detectedBy}

Reply YES — I am going to help
Reply NO — I cannot reach them`;
  };

  const buildGaitAlertMessage = (gaitReason: string) => {
    return buildEmergencyAlertMessage(gaitReason, 'Gait Monitor');
  };

  function calculateBaseline(magnitudes: number[]): GaitBaseline {
    const avg = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const squareDiffs = magnitudes.map(v => Math.pow(v - avg, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    const std = Math.sqrt(avgSquareDiff);
    const min = Math.min(...magnitudes);
    const max = Math.max(...magnitudes);

    let stepCount = 0;
    for (let i = 1; i < magnitudes.length; i++) {
      if (magnitudes[i] > avg + std && magnitudes[i - 1] <= avg + std) {
        stepCount++;
      }
    }

    return {
      avg,
      std,
      min,
      max,
      stepsPerMinute: stepCount,
      upperThreshold: avg + (std * 3),
      lowerThreshold: Math.max(avg - (std * 3), 0.5),
      rawSamples: magnitudes.length,
    };
  }

  function stopGaitGhost() {
    const saahas = getSaahasState();

    if (saahas.walk.gaitListener && saahas.walk.gaitListenerAttached) {
      window.removeEventListener('devicemotion', saahas.walk.gaitListener);
    }

    saahas.walk.gaitListener = null;
    saahas.walk.gaitListenerAttached = false;
    saahas.walk.gaitPaused = false;

    if (saahas.walk.gaitData) {
      saahas.walk.gaitData.anomalyActive = false;
      saahas.walk.gaitData.anomalyStartTime = null;
      saahas.walk.gaitData.anomalyType = null;
    }

    updateGaitBadge('unavailable');
    console.log('Gait Ghost: Stopped and cleaned up');
  }

  function fireGaitAlert(anomalyType: GaitAlertType, data: Record<string, unknown>) {
    const saahas = getSaahasState();

    if (saahas.alert.fired) return;
    saahas.alert.fired = true;

    const triggerReasons: Record<GaitAlertType, string> = {
      person_fell: 'A fall was detected',
      phone_fallen: 'Phone drop detected',
      struggle_detected: 'Unusual movement detected',
      sudden_stop: 'Sudden stop detected',
      extreme_deviation: 'Abnormal movement pattern',
      prolonged_still: 'No movement detected',
    };

    const gaitReason = triggerReasons[anomalyType];
    saahas.alert.trigger = 'gait_ghost';
    saahas.alert.gaitType = anomalyType;
    saahas.alert.gaitReason = gaitReason;
    saahas.alert.gaitData = data;
    saahas.alert.messageBody = buildGaitAlertMessage(gaitReason);

    console.error('Gait Ghost: ALERT FIRING', {
      type: anomalyType,
      reason: gaitReason,
      data,
    });

    stopGaitGhost();

    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 300]);
    }

    setIsAlertActive(true);
    setAlertTriggerReason(gaitReason);
    navigateTo('alert-sent');
  }

  function detectAllAnomalies(reading: GaitReading, gaitData: GaitDataStore) {
    const baseline = gaitData.baseline;
    if (!baseline) return;

    const now = reading.time;
    const mag = reading.magnitude;
    const x = reading.x;
    const y = reading.y;
    const z = reading.z;

    const isSuddenStop = (
      mag < 1.2 &&
      baseline.avg > 4.0
    );

    const isViolentStruggle = (
      mag > baseline.upperThreshold &&
      mag > 25
    );

    const isPhoneFallen = (
      Math.abs(z) > 8.5 &&
      Math.abs(x) < 2.5 &&
      Math.abs(y) < 2.5
    );

    const recentReadings = gaitData.readings.slice(-30);
    const recentAvg = recentReadings.length
      ? recentReadings.reduce((a, b) => a + b.magnitude, 0) / recentReadings.length
      : mag;

    const isPersonFell = (
      mag > 35 &&
      recentAvg < 3.0
    );

    const isExtremeDeviation = (
      mag > baseline.avg + (baseline.std * 5)
    );

    const isPhoneStill = mag < 0.5;
    if (isPhoneStill) {
      gaitData.phoneStillCount++;
    } else {
      gaitData.phoneStillCount = 0;
    }

    const isProblematicStill = gaitData.phoneStillCount > 750;
    const anomalyDetected = (
      isSuddenStop ||
      isViolentStruggle ||
      isPhoneFallen ||
      isPersonFell ||
      isExtremeDeviation ||
      isProblematicStill
    );

    let anomalyType: GaitAlertType | null = null;
    if (isPersonFell) anomalyType = 'person_fell';
    else if (isPhoneFallen) anomalyType = 'phone_fallen';
    else if (isViolentStruggle) anomalyType = 'struggle_detected';
    else if (isSuddenStop) anomalyType = 'sudden_stop';
    else if (isExtremeDeviation) anomalyType = 'extreme_deviation';
    else if (isProblematicStill) anomalyType = 'prolonged_still';

    gaitData.fallDetected = isPersonFell;
    gaitData.struggleDetected = isViolentStruggle;

    if (anomalyDetected && anomalyType) {
      if (!gaitData.anomalyActive) {
        gaitData.anomalyActive = true;
        gaitData.anomalyStartTime = now;
        gaitData.anomalyType = anomalyType;
        updateGaitBadge('anomaly');

        console.warn('Gait Ghost: Anomaly started', anomalyType, {
          magnitude: mag,
          baseline: baseline.avg,
          x,
          y,
          z,
        });
      } else if (gaitData.anomalyStartTime !== null) {
        const anomalyDuration = now - gaitData.anomalyStartTime;

        if (isPersonFell && anomalyDuration > 2000) {
          fireGaitAlert('person_fell', {
            magnitude: mag,
            duration: anomalyDuration,
            x,
            y,
            z,
          });
          return;
        }

        const activeAnomalyType = gaitData.anomalyType || anomalyType;
        const requiredDuration =
          activeAnomalyType === 'phone_fallen'
            ? 60000
            : 15000;

        if (anomalyDuration >= requiredDuration) {
          fireGaitAlert(activeAnomalyType, {
            magnitude: mag,
            duration: anomalyDuration,
            x,
            y,
            z,
          });
        }
      }
    } else if (gaitData.anomalyActive) {
      console.log('Gait Ghost: Anomaly cleared after', now - (gaitData.anomalyStartTime || now), 'ms');
      gaitData.anomalyActive = false;
      gaitData.anomalyStartTime = null;
      gaitData.anomalyType = null;
      updateGaitBadge('active');
    }
  }

  function initGaitMonitor() {
    const saahas = getSaahasState();
    const gaitData: GaitDataStore = {
      readings: [],
      baselineMagnitudes: [],
      baseline: null,
      isBaselineReady: false,
      anomalyStartTime: null,
      anomalyActive: false,
      lastReadingTime: null,
      phoneStillCount: 0,
      fallDetected: false,
      struggleDetected: false,
      readingCount: 0,
      anomalyType: null,
    };

    saahas.walk.gaitData = gaitData;
    saahas.walk.gaitStartTime = Date.now();
    saahas.walk.gaitPaused = false;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) {
        return;
      }

      const now = Date.now();
      const x = acc.x || 0;
      const y = acc.y || 0;
      const z = acc.z || 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      const rotation = event.rotationRate || { alpha: 0, beta: 0, gamma: 0 };

      const reading: GaitReading = {
        time: now,
        x: parseFloat(x.toFixed(3)),
        y: parseFloat(y.toFixed(3)),
        z: parseFloat(z.toFixed(3)),
        magnitude: parseFloat(magnitude.toFixed(3)),
        rotationAlpha: rotation.alpha || 0,
        rotationBeta: rotation.beta || 0,
        rotationGamma: rotation.gamma || 0,
        interval: event.interval || 0,
      };

      gaitData.lastReadingTime = now;
      gaitData.readingCount++;
      gaitData.readings.push(reading);

      if (gaitData.readings.length > 300) {
        gaitData.readings.shift();
      }

      const walkAge = now - (saahas.walk.gaitStartTime || now);

      if (walkAge < 60000) {
        gaitData.baselineMagnitudes.push(magnitude);
        return;
      }

      if (!gaitData.isBaselineReady && gaitData.baselineMagnitudes.length > 0) {
        gaitData.baseline = calculateBaseline(gaitData.baselineMagnitudes);
        gaitData.isBaselineReady = true;
        console.log('Gait Ghost: Baseline ready', gaitData.baseline);
      }

      if (gaitData.isBaselineReady) {
        detectAllAnomalies(reading, gaitData);
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    saahas.walk.gaitListener = handleMotion;
    saahas.walk.gaitListenerAttached = true;
  }

  function pauseGaitGhost() {
    const saahas = getSaahasState();

    if (saahas.walk.gaitListener && saahas.walk.gaitListenerAttached) {
      window.removeEventListener('devicemotion', saahas.walk.gaitListener);
      saahas.walk.gaitListenerAttached = false;
      saahas.walk.gaitPaused = true;
    }

    updateGaitBadge('unavailable');
    console.log('Gait Ghost: Paused for fake call');
  }

  function resumeGaitGhost() {
    const saahas = getSaahasState();

    if (!saahas.walk.gaitListener) {
      startGaitGhost();
      return;
    }

    if (!saahas.walk.gaitListenerAttached) {
      window.addEventListener('devicemotion', saahas.walk.gaitListener);
      saahas.walk.gaitListenerAttached = true;
    }

    saahas.walk.gaitPaused = false;
    updateGaitBadge(saahas.walk.gaitData?.anomalyActive ? 'anomaly' : 'active');
    console.log('Gait Ghost: Resumed after fake call');
  }

  function startGaitGhost() {
    const saahas = getSaahasState();

    if (saahas.walk.gaitListener && saahas.walk.gaitPaused) {
      resumeGaitGhost();
      return;
    }

    if (saahas.walk.gaitListenerAttached) {
      updateGaitBadge(saahas.walk.gaitData?.anomalyActive ? 'anomaly' : 'active');
      return;
    }

    if (typeof DeviceMotionEvent === 'undefined') {
      updateGaitBadge('unavailable');
      console.warn('Gait Ghost: Device motion unavailable');
      return;
    }

    const motionEvent = DeviceMotionEvent as typeof DeviceMotionEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };

    if (typeof motionEvent.requestPermission === 'function') {
      motionEvent.requestPermission()
        .then(permission => {
          if (permission === 'granted') {
            initGaitMonitor();
            updateGaitBadge('active');
          } else {
            updateGaitBadge('unavailable');
            console.warn('Gait Ghost: Permission denied by user');
          }
        })
        .catch(err => {
          updateGaitBadge('unavailable');
          console.warn('Gait Ghost: Permission error', err);
        });
    } else {
      initGaitMonitor();
      updateGaitBadge('active');
    }
  }

  useEffect(() => {
    getSaahasState();

    return () => {
      stopGaitGhost();
    };
  }, []);

  useEffect(() => {
    if (currentScreen === 'fake-call') {
      pauseGaitGhost();
      return;
    }

    if (currentScreen === 'active-walk') {
      startGaitGhost();
      return;
    }

    if (currentScreen === 'landing' || currentScreen === 'walk-complete' || currentScreen === 'alert-sent') {
      stopGaitGhost();
    }
  }, [currentScreen]);

  useEffect(() => {
    if (currentScreen !== 'alert-sent') {
      alertNotificationSentKey.current = null;
      return;
    }

    const emergencyContacts = getEmergencyContacts();
    if (emergencyContacts.length === 0) {
      return;
    }

    const saahas = getSaahasState();
    const readableReason = getReadableAlertReason(alertTriggerReason || saahas.alert.gaitReason || saahas.alert.trigger);
    const message = saahas.alert.messageBody || buildEmergencyAlertMessage(
      readableReason,
      saahas.alert.trigger === 'gait_ghost' ? 'Gait Monitor' : 'Saahas Safety App'
    );
    const alertKey = `${walkId || 'no-walk'}:${saahas.alert.trigger || alertTriggerReason || 'emergency_alert'}`;
    if (alertNotificationSentKey.current === alertKey) {
      return;
    }

    fetch('/api/notify-emergency-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: getCurrentUserName(),
        userPhone: getCurrentUserPhone(),
        emergencyContacts,
        walkId,
        alertReason: readableReason,
        message,
        latestLocation: latestLocationRef.current,
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data?.ackDeadlineAt) {
          setShadowAlertStatus({
            status: 'waiting_ack',
            shadowModeActive: false,
            automaticSosTriggered: false,
            ackDeadlineAt: data.ackDeadlineAt,
            acknowledgedAt: null,
            acknowledgedBy: null,
            nearbyUsersNotified: 0,
          });
        }
        console.log('WhatsApp emergency alert sent:', data);
      })
      .catch(err => {
        alertNotificationSentKey.current = null;
        console.error('WhatsApp emergency alert failed:', err);
      });

    alertNotificationSentKey.current = alertKey;
    saahas.alert.trigger = saahas.alert.trigger || alertTriggerReason || 'emergency_alert';
    saahas.alert.messageBody = message;
  }, [currentScreen, walkId, alertTriggerReason, guestData.name, guestData.phone, guestData.contact1, guestData.contact2, profileData.fullName, profileData.phone, profileData.contact1Name, profileData.contact1Phone, profileData.contact2Name, profileData.contact2Phone, currentLocation]);

  useEffect(() => {
    if (currentScreen !== 'walk-complete') {
      safeArrivalNotificationPendingKey.current = null;
      return;
    }

    const safeArrivalKey = `${walkId || 'no-walk'}:safe-arrival`;
    if (safeArrivalNotificationPendingKey.current !== safeArrivalKey) {
      return;
    }

    if (safeArrivalNotificationSentKey.current === safeArrivalKey) {
      return;
    }

    const emergencyContacts = getEmergencyContacts();
    if (emergencyContacts.length === 0) {
      return;
    }

    safeArrivalNotificationSentKey.current = safeArrivalKey;

    fetch('/api/notify-safe-arrival', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: guestData.name || profileData.fullName,
        userPhone: guestData.phone || profileData.phone,
        emergencyContacts,
        walkId,
      }),
    })
      .then((res) => res.json())
      .then((data) => console.log('WhatsApp safe-arrival notification sent:', data))
      .catch((err) => {
        safeArrivalNotificationSentKey.current = null;
        console.error('WhatsApp safe-arrival notification failed:', err);
      });
  }, [currentScreen, walkId, guestData.name, guestData.phone, guestData.contact1, guestData.contact2, profileData.fullName, profileData.phone, profileData.contact1Name, profileData.contact1Phone, profileData.contact2Name, profileData.contact2Phone]);

  useEffect(() => {
    if (!walkId || (currentScreen !== 'alert-sent' && currentScreen !== 'shadow-mode')) {
      return;
    }

    let stopped = false;

    const syncAlertStatus = () => {
      fetch(`/api/alert-status/${walkId}`)
        .then((res) => {
          if (!res.ok) {
            throw new Error(`Alert status request failed with ${res.status}`);
          }

          return res.json();
        })
        .then((data) => {
          if (stopped || !data?.alert) {
            return;
          }

          const nextStatus: ShadowAlertStatus = {
            status: data.alert.status || 'idle',
            shadowModeActive: Boolean(data.alert.shadowModeActive),
            automaticSosTriggered: Boolean(data.alert.automaticSosTriggered),
            ackDeadlineAt: data.alert.ackDeadlineAt ?? null,
            acknowledgedAt: data.alert.acknowledgedAt ?? null,
            acknowledgedBy: data.alert.acknowledgedBy ?? null,
            nearbyUsersNotified: Number(data.alert.nearbyUsersNotified ?? 0),
          };

          setShadowAlertStatus(nextStatus);

          if (data.alert.latestLocation?.lat !== undefined && data.alert.latestLocation?.lng !== undefined) {
            latestLocationRef.current = {
              lat: data.alert.latestLocation.lat,
              lng: data.alert.latestLocation.lng,
              time: data.alert.latestLocation.updatedAt || Date.now(),
              label: data.alert.latestLocation.label,
            };
          }
        })
        .catch((error) => {
          console.error('Alert status sync failed:', error);
        });
    };

    syncAlertStatus();
    const pollInterval = setInterval(syncAlertStatus, 5000);

    return () => {
      stopped = true;
      clearInterval(pollInterval);
    };
  }, [walkId, currentScreen]);

  // Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentScreen === 'active-walk' && timeLeft > 0 && !isAlertActive) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && currentScreen === 'active-walk' && !isAlertActive && !isBufferActive) {
      if (walkId && overdueNotificationSentWalkId.current !== walkId) {
        overdueNotificationSentWalkId.current = walkId;
        fetch('/api/notify-walk-overdue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userName: guestData.name || profileData.fullName,
            userPhone: guestData.phone || profileData.phone,
            emergencyContacts: [
              {
                name: profileData.contact1Name || 'Emergency Contact 1',
                phone: guestData.contact1 || profileData.contact1Phone,
              },
              {
                name: profileData.contact2Name || 'Emergency Contact 2',
                phone: guestData.contact2 || profileData.contact2Phone,
              },
            ],
            walkId,
          })
        })
          .then(res => res.json())
          .then(data => console.log('WhatsApp overdue alert sent:', data))
          .catch(err => console.error('WhatsApp overdue alert failed:', err));
      }
      setIsBufferActive(true);
      setBufferTime(30);
    }
    return () => clearInterval(interval);
  }, [currentScreen, timeLeft, isAlertActive, isBufferActive, guestData.name, guestData.phone, guestData.contact1, guestData.contact2, profileData.fullName, profileData.phone, profileData.contact1Name, profileData.contact1Phone, profileData.contact2Name, profileData.contact2Phone, walkId]);

  // Buffer Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isBufferActive && bufferTime > 0 && !isAlertActive) {
      interval = setInterval(() => {
        setBufferTime((prev) => prev - 1);
      }, 1000);
    } else if (isBufferActive && bufferTime === 0 && !isAlertActive) {
      setIsAlertActive(true);
      setAlertTriggerReason('walk_timer_buffer_expired');
      setCurrentScreen('alert-sent');
    }
    return () => clearInterval(interval);
  }, [isBufferActive, bufferTime, isAlertActive]);

  // PIN Confirmation Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentScreen === 'pin-confirm' && pinBufferActive && pinConfirmTimer > 0 && !pinSuccess) {
      interval = setInterval(() => {
        setPinConfirmTimer((prev) => prev - 1);
      }, 1000);
    } else if (currentScreen === 'pin-confirm' && pinBufferActive && pinConfirmTimer === 0 && !pinSuccess) {
      if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
      setIsAlertActive(true);
      setAlertTriggerReason('wrong_pin_timeout');
      setCurrentScreen('alert-sent');
    }
    return () => clearInterval(interval);
  }, [currentScreen, pinConfirmTimer, pinBufferActive, pinSuccess]);

  useEffect(() => {
    if (currentScreen === 'pin-confirm' && pinBufferActive && !pinSuccess) {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
          setIsAlertActive(true);
          setAlertTriggerReason('pin_confirm_backgrounded');
          setCurrentScreen('alert-sent');
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, [currentScreen, pinBufferActive, pinSuccess]);

  // Cancel Walk PIN Timer logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (showCancelModal && cancelPinTimer > 0) {
      interval = setInterval(() => {
        setCancelPinTimer((prev) => prev - 1);
      }, 1000);
    } else if (showCancelModal && cancelPinTimer === 0) {
      if (cancelPinResetTimeout.current) clearTimeout(cancelPinResetTimeout.current);
      setShowCancelModal(false);
      setCancelPinAttempt('');
      setCancelPinError(false);
      if (cancelPinAlertBufferActive) {
        if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
        setCancelPinAlertBufferActive(false);
        setCancelPinWrongAttemptCount(0);
        setIsAlertActive(true);
        setAlertTriggerReason('back_button_wrong_pin');
        setCurrentScreen('alert-sent');
      } else {
        setShowActiveToast(true);
        setTimeout(() => setShowActiveToast(false), 2000);
      }
    }
    return () => clearInterval(interval);
  }, [showCancelModal, cancelPinTimer, cancelPinAlertBufferActive]);

  useEffect(() => {
    return () => {
      if (cancelPinResetTimeout.current) clearTimeout(cancelPinResetTimeout.current);
    };
  }, []);

  // Intercept back button
  useEffect(() => {
    if (currentScreen === 'active-walk') {
      window.history.pushState(null, '', window.location.href);
      
      const handlePopState = (e: PopStateEvent) => {
        e.preventDefault();
        window.history.pushState(null, '', window.location.href);
        if (cancelPinResetTimeout.current) clearTimeout(cancelPinResetTimeout.current);
        setShowCancelModal(true);
        setCancelPinTimer(30);
        setCancelPinAttempt('');
        setCancelPinError(false);
        setCancelPinAlertBufferActive(false);
        setCancelPinWrongAttemptCount(0);
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
          if (cancelPinResetTimeout.current) clearTimeout(cancelPinResetTimeout.current);
          setShowCancelModal(false);
          setCancelPinAttempt('');
          setCancelPinError(false);
          setCancelPinAlertBufferActive(false);
          setCancelPinWrongAttemptCount(0);
          setCancelPinTimer(30);
          setTimeLeft(0);
          setIsBufferActive(false);
          setIsAlertActive(false);
          setCurrentScreen('landing');
          setAlertTriggerReason(null);
          setToastMessage('Walk cancelled safely');
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
          // Release WakeLock is handled by useEffect on currentScreen change
        } else {
          // Wrong PIN
          if (cancelPinResetTimeout.current) clearTimeout(cancelPinResetTimeout.current);
          setCancelPinError(true);
          setCancelPinWrongAttemptCount((prev) => prev + 1);
          if (!cancelPinAlertBufferActive) {
            setCancelPinAlertBufferActive(true);
            setCancelPinTimer(30);
          }
          if (navigator.vibrate) navigator.vibrate([500]);
          cancelPinResetTimeout.current = setTimeout(() => {
            setCancelPinAttempt('');
            setCancelPinError(false);
          }, 2000);
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
    if (pinAttempt.length < 4 && !pinError && !pinSuccess) {
      const newAttempt = [...pinAttempt, digit];
      setPinAttempt(newAttempt);
      
      if (newAttempt.length === 4) {
        const correctPin = guestData.pin.join('') || profileData.pin.join('');
        if (newAttempt.join('') === correctPin) {
          if (pinErrorResetTimeout.current) clearTimeout(pinErrorResetTimeout.current);
          if (pinSuccessTimeout.current) clearTimeout(pinSuccessTimeout.current);
          setPinBufferActive(false);
          setPinError(false);
          setPinSuccess(true);
          safeArrivalNotificationPendingKey.current = `${walkId || 'no-walk'}:safe-arrival`;
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          pinSuccessTimeout.current = setTimeout(() => setCurrentScreen('walk-complete'), 800);
        } else {
          if (!pinBufferActive) {
            setPinBufferActive(true);
            setPinConfirmTimer(30);
          }
          if (pinErrorResetTimeout.current) clearTimeout(pinErrorResetTimeout.current);
          setPinWrongAttemptCount((prev) => prev + 1);
          setPinError(true);
          if (navigator.vibrate) navigator.vibrate([500]);
          pinErrorResetTimeout.current = setTimeout(() => {
            setPinAttempt([]);
            setPinError(false);
          }, 2000);
        }
      }
    }
  };

  const handlePinBackspace = () => {
    if (!pinError && !pinSuccess) {
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
            latestLocationRef.current = {
              lat: latitude,
              lng: longitude,
              time: Date.now(),
              label: currentLocation,
            };
            
            // Breadcrumbs every 60s
            const now = Date.now();
            if (breadcrumbs.current.length === 0 || now - breadcrumbs.current[breadcrumbs.current.length - 1].time > 60000) {
              breadcrumbs.current.push({ lat: latitude, lng: longitude, time: now });
            }

            // Reverse Geocode
            try {
              const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`);
              const data = await res.json();
              const label = data.display_name.split(',')[0] + ', ' + (data.address.suburb || data.address.neighbourhood || '');
              setCurrentLocation(label);
              latestLocationRef.current = {
                lat: latitude,
                lng: longitude,
                time: now,
                label,
              };
              syncProfileLocation({
                lat: latitude,
                lng: longitude,
                time: now,
                label,
              }, walkId);
            } catch (e) {
              console.error("Geocoding failed", e);
              syncProfileLocation({
                lat: latitude,
                lng: longitude,
                time: now,
                label: currentLocation,
              }, walkId);
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
  }, [currentScreen, walkId]);

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
      setAlertTriggerReason(pinModalWrongPinBufferActive ? 'pin_modal_wrong_pin' : 'pin_modal_timeout');
      setCurrentScreen('alert-sent');
      console.log("PIN Timeout! SOS Alert Fired.");
    }
    return () => clearInterval(interval);
  }, [isPinModalOpen, pinTimeout, isAlertActive, pinModalWrongPinBufferActive]);

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
        if (pinModalResetTimeout.current) clearTimeout(pinModalResetTimeout.current);
        setIsPinModalOpen(false);
        setPinModalWrongPinBufferActive(false);
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
        // Wrong PIN - Start 30 second alert buffer
        if (pinModalResetTimeout.current) clearTimeout(pinModalResetTimeout.current);
        if (!pinModalWrongPinBufferActive) {
          setPinModalWrongPinBufferActive(true);
          setPinTimeout(30);
        }
        pinModalResetTimeout.current = setTimeout(() => {
          setConfirmationPin(['', '', '', '']);
        }, 2000);
        console.log("Wrong PIN detected. 30 second alert buffer started.");
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
    const saahas = getSaahasState();
    saahas.walk = {
      gaitData: null,
      gaitStartTime: null,
      gaitListener: null,
      gaitListenerAttached: false,
      gaitPaused: false,
    };
    saahas.alert = {
      fired: false,
      trigger: null,
      gaitType: null,
      gaitReason: null,
      gaitData: null,
      messageBody: null,
    };
    overdueNotificationSentWalkId.current = null;
    alertNotificationSentKey.current = null;
    safeArrivalNotificationSentKey.current = null;
    safeArrivalNotificationPendingKey.current = null;
    setWalkId(newWalkId);
    setTimeLeft(totalSeconds);
    setTotalTime(totalSeconds);
    setStartTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setPinModalWrongPinBufferActive(false);
    setConfirmationPin(['', '', '', '']);
    setPinTimeout(60);
    setAlertTriggerReason(null);
    setIsAlertActive(false);
    setShadowAlertStatus({
      status: 'idle',
      shadowModeActive: false,
      automaticSosTriggered: false,
      ackDeadlineAt: null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      nearbyUsersNotified: 0,
    });
    setCurrentScreen('active-walk');
    startGaitGhost();
    fetch('/api/notify-walk-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: guestData.name || profileData.fullName,
        userPhone: guestData.phone || profileData.phone,
        emergencyContacts: [
          {
            name: profileData.contact1Name || 'Emergency Contact 1',
            phone: guestData.contact1 || profileData.contact1Phone,
          },
          {
            name: profileData.contact2Name || 'Emergency Contact 2',
            phone: guestData.contact2 || profileData.contact2Phone,
          },
        ],
        walkDurationMinutes: durationMinutes,
        walkId: newWalkId
      })
    })
      .then(res => res.json())
      .then(data => console.log('WhatsApp notification sent:', data))
      .catch(err => console.error('WhatsApp notification failed:', err));
  };

  // Save to localStorage whenever guestData changes
  useEffect(() => {
    localStorage.setItem('saahas_guest', JSON.stringify(guestData));
  }, [guestData]);

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

  const handleSendNotification = () => {
    const walkDurationMinutes = guestData.isCustom
      ? (guestData.customHours * 60) + guestData.customMinutes
      : guestData.duration;
    const notificationWalkId = walkId || Math.random().toString(36).substring(2, 11);

    fetch('/api/notify-walk-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: guestData.name,
        userPhone: guestData.phone,
        emergencyContacts: [
          {
            name: 'Emergency Contact 1',
            phone: guestData.contact1,
          },
          {
            name: 'Emergency Contact 2',
            phone: guestData.contact2,
          },
        ],
        walkDurationMinutes,
        walkId: notificationWalkId,
      })
    })
      .then(res => res.json())
      .then(data => console.log('WhatsApp notification sent:', data))
      .catch(err => console.error('WhatsApp notification failed:', err));
  };

  const handleProfileLoginState = (fullName: string) => {
    const normalizedFullName = fullName.trim();
    setLoggedInUserName(normalizedFullName);
    localStorage.setItem('saahas_logged_in_profile_name', normalizedFullName);
    setShowProfileMenu(false);
  };

  const handleLogout = () => {
    setLoggedInUserName('');
    setShowProfileMenu(false);
    localStorage.removeItem('saahas_logged_in_profile_name');
  };

  const handleSaveProfile = () => {
    handleProfileLoginState(profileData.fullName);
    fetch('/api/profile/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: profileData.fullName,
        phone: profileData.phone,
        homeAddress: profileData.homeAddress,
        contact1Name: profileData.contact1Name,
        contact1Phone: profileData.contact1Phone,
        contact1Role: profileData.contact1Role,
        contact2Name: profileData.contact2Name,
        contact2Phone: profileData.contact2Phone,
        contact2Role: profileData.contact2Role,
        guardianName: profileData.guardianName,
        alertMessage: profileData.alertMessage,
        defaultDuration: profileData.defaultDuration,
        pin: profileData.pin.join(''),
      })
    })
      .then(res => res.json())
      .then(data => console.log('Profile saved to MongoDB:', data))
      .catch(err => console.error('Profile save failed:', err));

    startWalk(profileData.defaultDuration);
  };

  const handleLoginProfile = () => {
    fetch('/api/profile/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: profileData.phone,
        pin: profileData.pin.join(''),
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.profile) {
          setProfileData(data.profile);
          handleProfileLoginState(data.profile.fullName || profileData.fullName);
          setCurrentScreen('landing');
          console.log('Profile login successful:', data);
          return;
        }

        console.error('Profile login failed:', data);
      })
      .catch(err => console.error('Profile login failed:', err));
  };

  const handlePinConfirmClose = () => {
    if (pinErrorResetTimeout.current) clearTimeout(pinErrorResetTimeout.current);
    if (pinSuccessTimeout.current) clearTimeout(pinSuccessTimeout.current);
    if (pinBufferActive && navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
    setIsAlertActive(true);
    setAlertTriggerReason('pin_confirm_closed');
    setCurrentScreen('alert-sent');
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
            {loggedInUserName && (
              <div className="absolute top-8 right-8 z-20 flex flex-col items-end">
                <button
                  onClick={() => setShowProfileMenu(prev => !prev)}
                  className="w-12 h-12 rounded-full bg-white/10 border border-white/15 text-white font-headline font-black text-lg flex items-center justify-center shadow-[0_15px_40px_rgba(0,0,0,0.35)] backdrop-blur-md"
                >
                  {loggedInUserName.trim().charAt(0).toUpperCase()}
                </button>
                <AnimatePresence>
                  {showProfileMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                      className="mt-3 rounded-2xl bg-[#121725]/95 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl overflow-hidden"
                    >
                      <button
                        onClick={handleLogout}
                        className="px-5 py-3 text-[11px] tracking-[0.25em] font-bold text-white/80 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        LOG OUT
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
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
                onClick={() => setCurrentScreen('guest-setup')}
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
                    <label className="block font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-2 ml-1 font-bold">Phone Number</label>
                    <input 
                      className="w-full bg-surface-container-highest border border-outline-variant/15 rounded-xl px-5 py-4 focus:ring-1 focus:ring-primary/20 focus:border-primary/20 transition-all outline-none text-on-surface placeholder:text-on-secondary" 
                      placeholder="919876543210" 
                      type="tel"
                      value={profileData.phone}
                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
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
                      handleSaveProfile();
                    }}
                    className="w-full bg-linear-to-br from-primary to-tertiary py-5 rounded-2xl text-on-primary font-headline font-bold text-lg tracking-wide shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3" 
                    type="button"
                  >
                    <ShieldCheck className="w-6 h-6" />
                    SAVE PROFILE
                  </button>
                  <button 
                    onClick={() => {
                      handleLoginProfile();
                    }}
                    className="w-full mt-4 bg-surface-container border border-outline-variant/15 py-5 rounded-2xl text-on-surface font-headline font-bold text-lg tracking-wide active:scale-[0.98] transition-all flex items-center justify-center gap-3" 
                    type="button"
                  >
                    <User className="w-6 h-6" />
                    LOGIN PROFILE
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
                setAlertTriggerReason('manual_sos_triggered');
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
                <div id="badge-gait" className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <Footprints className="w-3 h-3" />
                  <span data-gait-label className="text-[9px] font-bold uppercase tracking-wider">Gait Monitor On</span>
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
                    setPinBufferActive(false);
                    setPinSuccess(false);
                    setPinWrongAttemptCount(0);
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
                    <h3 className="text-xl font-bold text-white mb-2">Leaving your walk?</h3>
                    <p className="text-sm text-[#888] mb-6 leading-relaxed">
                      Enter your PIN to cancel safely.<br />
                      Wrong PIN triggers an alert for your safety.
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
                          } ${cancelPinError ? 'border-[#FF3B30] bg-[#FF3B30]/10' : ''}`}
                        >
                          {cancelPinAttempt.length > i && (
                            <div className="w-3 h-3 rounded-full bg-white" />
                          )}
                        </motion.div>
                      ))}
                    </div>

                    {cancelPinError && (
                      <p className="text-[#FF3B30] text-[13px] font-medium mb-4 text-center">
                        {cancelPinWrongAttemptCount > 1
                          ? `Attempt ${cancelPinWrongAttemptCount}. Alert fires in ${cancelPinTimer} seconds`
                          : `Wrong PIN. Alert will fire in ${cancelPinTimer} seconds`}
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
                          className={`h-full rounded-full transition-colors duration-300 ${
                            cancelPinAlertBufferActive || cancelPinTimer <= 10 ? 'bg-[#FF3B30]' : 'bg-[#FF6B00]'
                          }`}
                        />
                      </div>
                      <p className="text-center text-[12px] text-[#888] font-medium">
                        {cancelPinAlertBufferActive ? 'Alert fires in ' : 'Modal closes in '}
                        <span className="text-white font-bold">{cancelPinTimer}</span>
                        {' '}seconds
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
                  <p className="font-label text-xs font-bold text-white whitespace-nowrap">Walk still active. You are protected.</p>
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
                onClick={handlePinConfirmClose}
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
              <h2 className="text-lg font-medium text-white">{pinBufferActive ? 'Enter correct PIN to stop alert' : 'Enter your secret PIN'}</h2>
              <p className="text-sm text-red-500 font-medium">{pinBufferActive ? 'Countdown will continue until the correct PIN is entered' : 'Enter your PIN to confirm safe arrival'}</p>
            </div>

            {/* PIN Boxes */}
            <div className="flex justify-center gap-3 mb-4">
              {[0, 1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  animate={pinSuccess ? { scale: [1, 1.08, 1] } : pinError ? { x: [0, -10, 10, -10, 10, 0] } : {}}
                  className={`w-16 h-20 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 ${
                    pinSuccess
                    ? 'border-[#00C853] bg-[#00C853]/10'
                    : pinAttempt.length > i 
                    ? 'bg-white/5 border-white/20' 
                    : pinAttempt.length === i 
                    ? 'bg-white/5 border-orange-500/50 shadow-[0_0_20px_rgba(255,143,120,0.1)]' 
                    : 'bg-white/5 border-white/10'
                  } ${pinError ? 'border-[#FF3B30] bg-[#FF3B30]/10' : ''}`}
                >
                  {pinSuccess ? (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-4 h-4 rounded-full bg-[#00C853] shadow-[0_0_12px_rgba(0,200,83,0.65)]"
                    />
                  ) : pinAttempt.length > i && (
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-4 h-4 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                    />
                  )}
                </motion.div>
              ))}
            </div>

            {(pinError || pinSuccess) && (
              <p className={`text-center mb-4 font-medium ${pinSuccess ? 'text-[#00C853] text-[14px]' : pinWrongAttemptCount > 1 ? 'text-[#FF3B30] text-[13px]' : 'text-[#FF3B30] text-[14px]'}`}>
                {pinSuccess ? 'Safe arrival confirmed' : pinWrongAttemptCount > 1 ? `Attempt ${pinWrongAttemptCount}. Alert fires in ${pinConfirmTimer} seconds` : 'Incorrect PIN'}
              </p>
            )}

            {pinBufferActive && !pinSuccess && (
              <div className="w-full space-y-3 mb-12">
                <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: '100%' }}
                    animate={{ width: `${(pinConfirmTimer / 30) * 100}%` }}
                    transition={{ duration: 1, ease: "linear" }}
                    className="h-full rounded-full bg-[#FF3B30]"
                  />
                </div>
                <p className="text-center text-[13px] text-[#888] font-medium">
                  Alert fires in {pinConfirmTimer} seconds
                </p>
              </div>
            )}

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
                            setAlertTriggerReason('fake_call_hidden_timeout');
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
            
            <p className={`text-sm text-center max-w-70 mb-12 leading-relaxed ${fakeCallPinSuccess ? 'text-[#00C853]' : fakeCallPinError ? 'text-[#FF3B30]' : 'text-[#888]'}`}>
              {fakeCallPinSuccess 
                ? "Stay safe. Walk resumed."
                : fakeCallPinError 
                  ? "Wrong PIN detected"
                  : "Enter your secret PIN to confirm. No response in 30 seconds = alert fires."
              }
            </p>

            {/* Countdown Bar */}
            {!fakeCallPinSuccess && (
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
                {fakeCallWrongPinBufferActive && (
                  <p className="text-[13px] text-[#888] text-center mt-2">
                    Alert fires in {fakeCallWrongPinTimer} seconds
                  </p>
                )}
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
              {shadowAlertStatus.status === 'waiting_ack'
                ? 'Your emergency contacts have been notified. Waiting 60 seconds for a YES acknowledgment before Shadow Mode starts silently.'
                : shadowAlertStatus.status === 'acknowledged'
                  ? 'An emergency contact acknowledged with YES. Shadow Mode remains off.'
                  : shadowAlertStatus.shadowModeActive
                    ? `No acknowledgment was received. Shadow Mode is now active in the background and automatic SOS has been triggered${shadowAlertStatus.nearbyUsersNotified > 0 ? ` for ${shadowAlertStatus.nearbyUsersNotified} nearby Saahas users.` : '.'}`
                    : 'Your emergency contacts and local authorities have been notified with your live location.'}
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
        ) : (
          <motion.div
            key="guest-setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="min-h-screen flex flex-col bg-background relative"
          >
            {/* Decorative Atmosphere */}
            <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[40%] bg-primary/5 blur-[120px] rounded-full -z-10" />
            <div className="fixed bottom-[10%] left-[-20%] w-[60%] h-[40%] bg-tertiary/5 blur-[120px] rounded-full -z-10" />

            {/* Header Section */}
            <header className="px-6 pt-8 pb-4 flex items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-xl">
              <button 
                onClick={() => setCurrentScreen('landing')}
                className="p-2 -ml-2 rounded-full hover:bg-surface-highest transition-colors active:scale-95 duration-200"
              >
                <ArrowLeft className="w-6 h-6 text-on-surface" />
              </button>
              <div className="flex-1 px-4">
                <h1 className="font-headline font-bold text-2xl tracking-tight text-white">सAAहस</h1>
                <p className="font-sans text-on-surface-variant text-[10px] uppercase tracking-widest mt-0.5">Takes 30 seconds. Keeps you safe.</p>
              </div>
              <div className="w-10 h-10 rounded-full border border-outline-variant/20 flex items-center justify-center bg-surface-low">
                <Shield className="w-5 h-5 text-primary" fill="currentColor" fillOpacity={0.2} />
              </div>
            </header>

            <main className="flex-1 px-6 pt-4 pb-32 overflow-y-auto">
              <div className="space-y-8">
                {/* User Info Section */}
                <div className="space-y-6">
                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1 bg-background text-[10px] font-sans uppercase tracking-widest text-on-surface-variant font-bold">Your Name</label>
                    <input 
                      type="text" 
                      placeholder="Enter your full name"
                      value={guestData.name}
                      onChange={(e) => setGuestData({ ...guestData, name: e.target.value })}
                      className="w-full bg-surface-low border border-outline-variant/30 rounded-xl px-4 py-4 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none transition-all font-body"
                    />
                  </div>
                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1 bg-background text-[10px] font-sans uppercase tracking-widest text-on-surface-variant font-bold">Your Phone Number</label>
                    <input 
                      type="tel" 
                      placeholder="+91 00000 00000"
                      value={guestData.phone}
                      onChange={(e) => setGuestData({ ...guestData, phone: e.target.value })}
                      className="w-full bg-surface-low border border-outline-variant/30 rounded-xl px-4 py-4 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none transition-all font-body"
                    />
                  </div>
                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1 bg-background text-[10px] font-sans uppercase tracking-widest text-on-surface-variant font-bold">Emergency Contact 1</label>
                    <input 
                      type="tel" 
                      placeholder="+91 00000 00000"
                      value={guestData.contact1}
                      onChange={(e) => setGuestData({ ...guestData, contact1: e.target.value })}
                      className="w-full bg-surface-low border border-outline-variant/30 rounded-xl px-4 py-4 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none transition-all font-body"
                    />
                  </div>
                  <div className="relative">
                    <label className="absolute -top-2 left-3 px-1 bg-background text-[10px] font-sans uppercase tracking-widest text-on-surface-variant font-bold">Emergency Contact 2</label>
                    <input 
                      type="tel" 
                      placeholder="+91 00000 00000"
                      value={guestData.contact2}
                      onChange={(e) => setGuestData({ ...guestData, contact2: e.target.value })}
                      className="w-full bg-surface-low border border-outline-variant/30 rounded-xl px-4 py-4 text-on-surface placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:outline-none transition-all font-body"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendNotification}
                    className="w-full py-4 rounded-xl bg-linear-to-r from-primary to-tertiary text-on-primary font-headline font-bold tracking-wider active:scale-95 transition-all"
                  >
                    SEND NOTIFICATION
                  </button>
                </div>

                {/* Walk Duration Selector */}
                <div className="space-y-4">
                  <h3 className="font-headline font-semibold text-sm uppercase tracking-wider text-on-surface/80">Walk Duration</h3>
                  <div className="grid grid-cols-5 gap-2">
                    {[5, 10, 15, 30].map((min) => (
                      <button
                        key={min}
                        onClick={() => setGuestData({ ...guestData, duration: min, isCustom: false })}
                        className={`py-3 rounded-xl border transition-all active:scale-95 text-sm font-headline font-bold ${
                          !guestData.isCustom && guestData.duration === min 
                          ? 'bg-linear-to-br from-primary to-tertiary text-on-primary border-transparent shadow-[0_0_32px_rgba(255,143,120,0.15)]' 
                          : 'bg-surface-low border-outline-variant/30 text-on-surface hover:border-primary/50'
                        }`}
                      >
                        {min}m
                      </button>
                    ))}
                    <button 
                      onClick={() => setGuestData({ ...guestData, isCustom: true })}
                      className={`py-3 rounded-xl border transition-all active:scale-95 text-xs font-headline font-bold ${
                        guestData.isCustom 
                        ? 'bg-linear-to-br from-primary to-tertiary text-on-primary border-transparent shadow-[0_0_32px_rgba(255,143,120,0.15)]' 
                        : 'bg-surface-low border-outline-variant/30 text-on-surface hover:border-primary/50'
                      }`}
                    >
                      Custom
                    </button>
                  </div>

                  {/* Custom Time Input */}
                  <AnimatePresence>
                    {guestData.isCustom && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-3 flex items-center gap-3 p-4 bg-surface-high/30 rounded-2xl border border-outline-variant/20">
                          <div className="flex-1 flex items-center justify-center gap-2">
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] uppercase tracking-tighter text-on-surface-variant mb-1 font-bold">Hours</span>
                              <input 
                                type="number" 
                                min="0" 
                                max="23"
                                value={guestData.customHours}
                                onChange={(e) => setGuestData({ ...guestData, customHours: parseInt(e.target.value) || 0 })}
                                className="w-12 h-10 bg-surface-low border border-outline-variant/30 rounded-lg text-center font-headline font-bold text-lg text-primary focus:ring-1 focus:ring-primary/40 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                            <span className="text-on-surface-variant font-bold text-xl mt-4">:</span>
                            <div className="flex flex-col items-center">
                              <span className="text-[10px] uppercase tracking-tighter text-on-surface-variant mb-1 font-bold">Minutes</span>
                              <input 
                                type="number" 
                                min="0" 
                                max="59"
                                value={guestData.customMinutes}
                                onChange={(e) => setGuestData({ ...guestData, customMinutes: parseInt(e.target.value) || 0 })}
                                className="w-12 h-10 bg-surface-low border border-outline-variant/30 rounded-lg text-center font-headline font-bold text-lg text-primary focus:ring-1 focus:ring-primary/40 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </div>
                          </div>
                          <div className="h-10 w-px bg-outline-variant/20 mx-2" />
                          <p className="flex-1 text-[10px] text-on-surface-variant leading-tight font-medium">Setting a custom duration allows for longer treks with your allies.</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* PIN Creation Section */}
                <div className="space-y-4">
                  <div className="flex flex-col space-y-1">
                    <h3 className="font-headline font-semibold text-sm uppercase tracking-wider text-on-surface/80">Create Your Safety PIN</h3>
                    <p className="font-sans text-on-surface-variant text-[11px] font-medium">Only this PIN ends your walk safely. Keep it secret.</p>
                  </div>
                  <div className="flex justify-between max-w-xs gap-4">
                    {guestData.pin.map((digit, i) => (
                      <input
                        key={i}
                        id={`pin-${i}`}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleGuestPinChange(i, e.target.value)}
                        className="w-14 h-16 bg-surface-highest border border-outline-variant/30 rounded-xl text-center text-2xl font-bold text-primary focus:ring-1 focus:ring-primary/40 focus:outline-none transition-all"
                      />
                    ))}
                  </div>
                </div>

                {/* Visual Context - Informational Card */}
                <div className="bg-surface-high/50 p-5 rounded-2xl border border-outline-variant/10 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 shrink-0 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-sm text-on-surface">Live Ally Monitoring</h4>
                    <p className="font-body text-xs text-on-surface-variant mt-1 leading-relaxed">Your selected contacts will receive a live tracking link once you begin. They'll be alerted if the timer expires without your PIN.</p>
                  </div>
                </div>
              </div>
            </main>

            {/* Fixed Bottom Action Bar */}
            <footer className="fixed bottom-0 left-0 w-full p-6 bg-linear-to-t from-background via-background to-transparent pt-12 z-20">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const duration = guestData.isCustom 
                    ? (guestData.customHours * 60) + guestData.customMinutes 
                    : guestData.duration;
                  startWalk(duration);
                }}
                className="w-full py-5 rounded-full bg-linear-to-r from-primary to-tertiary text-on-primary font-headline font-extrabold tracking-widest text-base shadow-[0_8px_30px_rgba(255,143,120,0.3)] active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                START WALKING
                <ArrowRight className="w-5 h-5" strokeWidth={3} />
              </motion.button>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
