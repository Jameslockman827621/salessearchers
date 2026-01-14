'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Phone,
  PhoneOff,
  Loader2,
  User,
  Building2,
  Mail,
  Send,
  Clock,
  ChevronRight,
  MessageSquare,
  Sparkles,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Voicemail,
  Calendar,
  ArrowRight,
  Copy,
  Check,
} from 'lucide-react';
import { format } from 'date-fns';

type CallOutcome = 
  | 'SEND_EMAIL'
  | 'FOLLOW_UP_LATER'
  | 'BOOKED_MEETING'
  | 'NOT_INTERESTED'
  | 'NO_ANSWER'
  | 'LEFT_VOICEMAIL'
  | 'WRONG_NUMBER'
  | 'COMPLETED';

const outcomeOptions: { value: CallOutcome; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'SEND_EMAIL', label: 'Send Email', icon: <Mail size={16} />, color: 'text-blue-400' },
  { value: 'FOLLOW_UP_LATER', label: 'Follow Up Later', icon: <Clock size={16} />, color: 'text-yellow-400' },
  { value: 'BOOKED_MEETING', label: 'Booked Meeting', icon: <Calendar size={16} />, color: 'text-green-400' },
  { value: 'NOT_INTERESTED', label: 'Not Interested', icon: <XCircle size={16} />, color: 'text-red-400' },
  { value: 'NO_ANSWER', label: 'No Answer', icon: <PhoneOff size={16} />, color: 'text-surface-400' },
  { value: 'LEFT_VOICEMAIL', label: 'Left Voicemail', icon: <Voicemail size={16} />, color: 'text-purple-400' },
  { value: 'COMPLETED', label: 'Completed', icon: <CheckCircle size={16} />, color: 'text-green-400' },
];

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: { id: string; name: string; domain: string | null } | null;
}

interface AIBrief {
  personalization: string[];
  openers: string[];
  discoveryQuestions: string[];
  pitch: string;
  objectionHandlers: Record<string, string>;
  closeStatement: string;
}

export default function CallQueuePage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const initialContactId = searchParams.get('contactId');
  
  // State
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<CallOutcome>('SEND_EMAIL');
  const [notes, setNotes] = useState('');
  const [copiedOpener, setCopiedOpener] = useState<number | null>(null);
  
  // AI Brief state
  const [aiBrief, setAiBrief] = useState<AIBrief | null>(null);
  const [isLoadingBrief, setIsLoadingBrief] = useState(false);
  
  // Email draft state
  const [emailDraft, setEmailDraft] = useState<{ subject: string; body: string } | null>(null);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [emailGenerated, setEmailGenerated] = useState(false);

  // Queries
  const { data: queue, isLoading: isLoadingQueue } = useQuery({
    queryKey: ['callQueue'],
    queryFn: () => api.getCallQueue(),
    refetchInterval: 30000,
  });

  const { data: activeCall } = useQuery({
    queryKey: ['activeCall'],
    queryFn: () => api.getActiveCall(),
    refetchInterval: 5000,
  });

  // Mutations
  const startCallMutation = useMutation({
    mutationFn: (contactId: string) => api.startCall(contactId),
    onSuccess: (data) => {
      setActiveCallId(data.callId);
      setCallStartTime(new Date(data.startedAt));
      setShowWrapUp(false);
      queryClient.invalidateQueries({ queryKey: ['callQueue'] });
    },
  });

  const wrapUpMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.wrapUpCall>[0]) => api.wrapUpCall(data),
    onSuccess: () => {
      setActiveCallId(null);
      setCallStartTime(null);
      setShowWrapUp(false);
      setNotes('');
      setSelectedContact(null);
      setAiBrief(null);
      setEmailDraft(null);
      setEmailGenerated(false);
      queryClient.invalidateQueries({ queryKey: ['callQueue'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });

  // Generate email preview mutation
  const generateEmailMutation = useMutation({
    mutationFn: async () => {
      // Call the wrap-up endpoint with preview mode to get email draft
      const response = await api.wrapUpCall({
        callId: activeCallId!,
        outcome: selectedOutcome,
        notes,
        generateEmail: true,
        createTask: false,
        previewOnly: true,
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.emailDraft) {
        setEmailDraft({
          subject: data.emailDraft.subject,
          body: data.emailDraft.body,
        });
        setEmailGenerated(true);
      }
      setIsGeneratingEmail(false);
    },
    onError: () => {
      setIsGeneratingEmail(false);
    },
  });

  const generateBriefMutation = useMutation({
    mutationFn: (contactId: string) => api.generateCallBrief(contactId),
    onSuccess: (data) => {
      setAiBrief({
        personalization: data.personalization,
        openers: data.openers,
        discoveryQuestions: data.discoveryQuestions,
        pitch: data.pitch,
        objectionHandlers: data.objectionHandlers,
        closeStatement: data.closeStatement,
      });
      setIsLoadingBrief(false);
    },
    onError: () => {
      setIsLoadingBrief(false);
    },
  });

  // Load AI brief when contact is selected
  const loadBrief = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    setIsLoadingBrief(true);
    setAiBrief(null);
    generateBriefMutation.mutate(contact.id);
  }, [generateBriefMutation]);

  // Check for active call on mount
  useEffect(() => {
    if (activeCall) {
      setActiveCallId(activeCall.callId);
      setCallStartTime(new Date(activeCall.startedAt));
      if (activeCall.contact) {
        setSelectedContact(activeCall.contact);
      }
    }
  }, [activeCall]);

  // Handle initial contactId from URL
  useEffect(() => {
    if (initialContactId && queue && !selectedContact) {
      // Try to find in queue first
      const taskContact = queue.tasksToday?.find(t => t.contact?.id === initialContactId)?.contact;
      const outreachContact = queue.needsOutreach?.find(c => c.id === initialContactId);
      
      if (taskContact) {
        loadBrief(taskContact);
      } else if (outreachContact) {
        loadBrief(outreachContact as Contact);
      } else {
        // Contact not in queue, fetch directly via API and load brief
        generateBriefMutation.mutate(initialContactId);
      }
    }
  }, [initialContactId, queue, selectedContact, loadBrief, generateBriefMutation]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'Escape') {
        if (showWrapUp) {
          setShowWrapUp(false);
        }
      }

      if (e.key === 'Enter' && e.metaKey) {
        if (activeCallId && showWrapUp) {
          handleWrapUp();
        } else if (selectedContact && !activeCallId) {
          handleStartCall();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeCallId, showWrapUp, selectedContact]);

  const handleStartCall = () => {
    if (!selectedContact) return;
    startCallMutation.mutate(selectedContact.id);
  };

  const handleEndCall = () => {
    setShowWrapUp(true);
    setEmailDraft(null);
    setEmailGenerated(false);
  };

  const handleGenerateEmailPreview = () => {
    setIsGeneratingEmail(true);
    generateEmailMutation.mutate();
  };

  const handleWrapUp = () => {
    if (!activeCallId) return;
    wrapUpMutation.mutate({
      callId: activeCallId,
      outcome: selectedOutcome,
      notes,
      generateEmail: selectedOutcome === 'SEND_EMAIL',
      createTask: ['SEND_EMAIL', 'FOLLOW_UP_LATER', 'LEFT_VOICEMAIL'].includes(selectedOutcome),
      // Send the email if outcome is SEND_EMAIL and we have a draft
      sendEmail: selectedOutcome === 'SEND_EMAIL' && !!emailDraft,
      emailSubject: emailDraft?.subject,
      emailBody: emailDraft?.body,
    });
  };

  const copyOpener = (opener: string, index: number) => {
    navigator.clipboard.writeText(opener);
    setCopiedOpener(index);
    setTimeout(() => setCopiedOpener(null), 2000);
  };

  const callDuration = callStartTime 
    ? Math.floor((Date.now() - callStartTime.getTime()) / 1000)
    : 0;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Combine queue items
  const queueItems = [
    ...(queue?.tasksToday?.map(t => ({ ...t, contact: t.contact, queueType: 'task' as const })) || []),
    ...(queue?.needsOutreach?.map(c => ({ id: c.id, contact: c, queueType: 'outreach' as const })) || []),
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left: Queue */}
      <div className="w-80 flex-shrink-0 border-r border-surface-800 bg-surface-950 overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-surface-800 bg-surface-950 p-4">
          <h2 className="text-lg font-semibold text-surface-100">Call Queue</h2>
          <p className="mt-1 text-sm text-surface-400">
            {queueItems.length} contacts to call
          </p>
        </div>

        {isLoadingQueue ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="animate-spin text-primary-500" size={24} />
          </div>
        ) : queueItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <Phone className="mb-4 text-surface-600" size={48} />
            <p className="text-surface-400">No calls in queue</p>
            <p className="mt-2 text-sm text-surface-500">
              Import contacts or create call tasks
            </p>
          </div>
        ) : (
          <div className="divide-y divide-surface-800">
            {queueItems.map((item) => {
              const contact = 'contact' in item && item.contact ? item.contact : item as unknown as Contact;
              const isSelected = selectedContact?.id === contact?.id;
              const isActive = activeCallId && selectedContact?.id === contact?.id;

              if (!contact) return null;

              return (
                <button
                  key={item.id}
                  onClick={() => loadBrief(contact)}
                  className={`w-full p-4 text-left transition-colors ${
                    isActive
                      ? 'bg-green-500/10 border-l-2 border-green-500'
                      : isSelected
                      ? 'bg-primary-500/10 border-l-2 border-primary-500'
                      : 'hover:bg-surface-800/50 border-l-2 border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-800 text-sm font-medium text-surface-300">
                      {contact.firstName?.[0] || contact.email?.[0]?.toUpperCase() || '?'}
                      {contact.lastName?.[0] || ''}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <p className="truncate font-medium text-surface-100">
                        {[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || 'Unknown'}
                      </p>
                      <p className="truncate text-xs text-surface-400">
                        {contact.title || 'No title'}
                      </p>
                      {contact.company && (
                        <p className="truncate text-xs text-surface-500">
                          {contact.company.name}
                        </p>
                      )}
                      {contact.phone && (
                        <p className="mt-1 text-xs text-primary-400">
                          {contact.phone}
                        </p>
                      )}
                    </div>
                    {isActive && (
                      <span className="flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
                        Live
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Center: Contact + AI Brief */}
      <div className="flex-1 overflow-y-auto bg-surface-900 p-6">
        {!selectedContact ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <User className="mb-4 text-surface-600" size={64} />
            <h3 className="text-xl font-semibold text-surface-300">Select a contact</h3>
            <p className="mt-2 text-surface-500">
              Choose a contact from the queue to see their AI brief
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {/* Contact Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-800 text-xl font-bold text-surface-300">
                  {selectedContact.firstName?.[0] || '?'}
                  {selectedContact.lastName?.[0] || ''}
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-surface-100">
                    {[selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(' ') || 'Unknown'}
                  </h1>
                  <p className="text-surface-400">
                    {selectedContact.title || 'No title'}
                    {selectedContact.company && ` at ${selectedContact.company.name}`}
                  </p>
                  <div className="mt-1 flex items-center gap-4 text-sm">
                    {selectedContact.phone && (
                      <a href={`tel:${selectedContact.phone}`} className="flex items-center gap-1 text-primary-400 hover:underline">
                        <Phone size={14} />
                        {selectedContact.phone}
                      </a>
                    )}
                    {selectedContact.email && (
                      <a href={`mailto:${selectedContact.email}`} className="flex items-center gap-1 text-primary-400 hover:underline">
                        <Mail size={14} />
                        {selectedContact.email}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Call Controls */}
              <div className="flex items-center gap-3">
                {activeCallId ? (
                  <>
                    <div className="flex items-center gap-2 rounded-lg bg-green-500/20 px-4 py-2 text-green-400">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
                      <span className="font-mono">{formatDuration(callDuration)}</span>
                    </div>
                    <button
                      onClick={handleEndCall}
                      className="flex items-center gap-2 rounded-lg bg-red-600 px-6 py-3 font-medium text-white hover:bg-red-700"
                    >
                      <PhoneOff size={18} />
                      End Call
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleStartCall}
                    disabled={startCallMutation.isPending || !selectedContact.phone}
                    className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-3 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {startCallMutation.isPending ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Phone size={18} />
                    )}
                    Start Call
                  </button>
                )}
              </div>
            </div>

            {/* AI Brief */}
            {isLoadingBrief ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-surface-700 bg-surface-800/50 p-12">
                <Loader2 className="mb-4 animate-spin text-primary-500" size={32} />
                <p className="text-surface-400">Generating AI brief...</p>
              </div>
            ) : aiBrief ? (
              <div className="space-y-4">
                {/* Personalization */}
                <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-surface-300">
                    <Sparkles size={16} className="text-yellow-400" />
                    Why This Matters
                  </div>
                  <ul className="space-y-2">
                    {aiBrief.personalization.map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-surface-300">
                        <ChevronRight size={14} className="mt-0.5 text-primary-400" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Openers */}
                <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-surface-300">
                    <MessageSquare size={16} className="text-blue-400" />
                    Opening Lines
                  </div>
                  <div className="space-y-2">
                    {aiBrief.openers.map((opener, i) => (
                      <div
                        key={i}
                        className="group flex items-start justify-between gap-2 rounded-lg bg-surface-900 p-3"
                      >
                        <p className="text-sm text-surface-200">{opener}</p>
                        <button
                          onClick={() => copyOpener(opener, i)}
                          className="flex-shrink-0 rounded p-1 text-surface-500 opacity-0 transition-opacity hover:bg-surface-700 hover:text-surface-300 group-hover:opacity-100"
                        >
                          {copiedOpener === i ? (
                            <Check size={14} className="text-green-400" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Discovery Questions */}
                <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
                  <div className="mb-3 flex items-center gap-2 text-sm font-medium text-surface-300">
                    <AlertCircle size={16} className="text-orange-400" />
                    Discovery Questions
                  </div>
                  <ul className="space-y-2">
                    {aiBrief.discoveryQuestions.map((q, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-surface-300">
                        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-700 text-xs text-surface-400">
                          {i + 1}
                        </span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Objection Handlers */}
                {Object.keys(aiBrief.objectionHandlers).length > 0 && (
                  <div className="rounded-xl border border-surface-700 bg-surface-800/50 p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-medium text-surface-300">
                      <XCircle size={16} className="text-red-400" />
                      Objection Handlers
                    </div>
                    <div className="space-y-3">
                      {Object.entries(aiBrief.objectionHandlers).map(([objection, response], i) => (
                        <div key={i} className="rounded-lg bg-surface-900 p-3">
                          <p className="text-xs font-medium text-red-400">"{objection}"</p>
                          <p className="mt-1 text-sm text-surface-300">{response}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-xl border border-surface-700 bg-surface-800/50 p-12">
                <Sparkles className="mb-4 text-surface-600" size={32} />
                <p className="text-surface-400">AI brief will appear here</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Wrap-up Modal */}
      {showWrapUp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-surface-700 bg-surface-900 shadow-xl">
            <div className="border-b border-surface-800 p-4">
              <h2 className="text-lg font-semibold text-surface-100">Wrap Up Call</h2>
              <p className="text-sm text-surface-400">
                Call duration: {formatDuration(callDuration)}
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* Outcome Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium text-surface-300">
                  Call Outcome
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {outcomeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setSelectedOutcome(option.value);
                        // Reset email draft when changing outcome
                        if (option.value !== 'SEND_EMAIL') {
                          setEmailDraft(null);
                          setEmailGenerated(false);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-lg border p-3 text-left text-sm transition-colors ${
                        selectedOutcome === option.value
                          ? 'border-primary-500 bg-primary-500/10 text-primary-400'
                          : 'border-surface-700 bg-surface-800 text-surface-300 hover:border-surface-600'
                      }`}
                    >
                      <span className={option.color}>{option.icon}</span>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-2 block text-sm font-medium text-surface-300">
                  Call Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    // Reset email draft when notes change
                    if (emailGenerated) {
                      setEmailGenerated(false);
                    }
                  }}
                  placeholder="What was discussed? Any key takeaways..."
                  className="h-32 w-full resize-none rounded-lg border border-surface-700 bg-surface-800 p-3 text-sm text-surface-100 placeholder-surface-500 focus:border-primary-500 focus:outline-none"
                />
              </div>

              {/* Generate Email Preview Button */}
              {selectedOutcome === 'SEND_EMAIL' && !emailGenerated && (
                <button
                  onClick={handleGenerateEmailPreview}
                  disabled={isGeneratingEmail || !notes.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/50 bg-blue-500/10 p-4 text-sm font-medium text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingEmail ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Generating Email Draft...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generate Email Draft Preview
                      {!notes.trim() && <span className="text-xs text-surface-500 ml-2">(add notes first)</span>}
                    </>
                  )}
                </button>
              )}

              {/* Email Draft Preview */}
              {selectedOutcome === 'SEND_EMAIL' && emailDraft && (
                <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-green-400">
                      <Mail size={16} />
                      Email Draft Preview
                    </div>
                    <button
                      onClick={handleGenerateEmailPreview}
                      disabled={isGeneratingEmail}
                      className="flex items-center gap-1 text-xs text-surface-400 hover:text-surface-300"
                    >
                      <RefreshCw size={12} className={isGeneratingEmail ? 'animate-spin' : ''} />
                      Regenerate
                    </button>
                  </div>
                  
                  {/* Subject */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-surface-400">Subject</label>
                    <input
                      type="text"
                      value={emailDraft.subject}
                      onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                      className="w-full rounded-lg border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-100 focus:border-primary-500 focus:outline-none"
                    />
                  </div>
                  
                  {/* Body */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-surface-400">Body</label>
                    <textarea
                      value={emailDraft.body}
                      onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })}
                      className="h-48 w-full resize-none rounded-lg border border-surface-600 bg-surface-800 p-3 text-sm text-surface-100 focus:border-primary-500 focus:outline-none font-mono"
                    />
                  </div>
                  
                  <p className="text-xs text-surface-500">
                    You can edit the email before completing. This draft will be saved with the meeting record.
                  </p>
                </div>
              )}

              {/* Task info */}
              {['SEND_EMAIL', 'FOLLOW_UP_LATER', 'LEFT_VOICEMAIL'].includes(selectedOutcome) && (
                <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 p-3 text-sm text-yellow-400">
                  <Clock size={16} />
                  Will create follow-up task
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-surface-800 p-4">
              <button
                onClick={() => {
                  setShowWrapUp(false);
                  setEmailDraft(null);
                  setEmailGenerated(false);
                }}
                className="rounded-lg border border-surface-700 px-4 py-2 text-sm font-medium text-surface-300 hover:bg-surface-800"
              >
                Cancel
              </button>
              <button
                onClick={handleWrapUp}
                disabled={wrapUpMutation.isPending || (selectedOutcome === 'SEND_EMAIL' && !emailGenerated)}
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {wrapUpMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
                {selectedOutcome === 'SEND_EMAIL' ? 'Send Email & Complete' : 'Complete & Next'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

