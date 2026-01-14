'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type GenerationType = 'email' | 'linkedin' | 'call-script' | 'objection' | 'improve';
type EmailType = 'follow_up' | 'cold' | 'reply';
type LinkedInType = 'connection' | 'inmail' | 'reply';
type ImproveGoal = 'shorter' | 'longer' | 'formal' | 'casual' | 'persuasive';

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company?: { name: string } | null;
}

interface Deal {
  id: string;
  name: string;
  value: number | null;
}

interface Meeting {
  id: string;
  title: string | null;
  scheduledAt: string | null;
}

interface ContentHistoryItem {
  id: string;
  type: string;
  title: string | null;
  content: string;
  sourceType: string | null;
  isUsed: boolean;
  rating: number | null;
  createdAt: string;
}

interface EmailResult {
  subject: string;
  body: string;
  tone: 'formal' | 'friendly' | 'urgent';
}

interface LinkedInResult {
  message: string;
}

interface CallScriptResult {
  opening: string;
  discovery: string[];
  pitch: string;
  objectionHandlers: Record<string, string>;
  close: string;
}

interface ObjectionResult {
  response: string;
}

interface ImproveResult {
  original: string;
  improved: string;
  goal: string;
}

type AIResult = EmailResult | LinkedInResult | CallScriptResult | ObjectionResult | ImproveResult;

export default function AIAssistantPage() {
  const [generationType, setGenerationType] = useState<GenerationType>('email');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Email options
  const [emailType, setEmailType] = useState<EmailType>('follow_up');
  const [selectedContact, setSelectedContact] = useState<string>('');
  const [selectedDeal, setSelectedDeal] = useState<string>('');
  const [selectedMeeting, setSelectedMeeting] = useState<string>('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('');

  // LinkedIn options
  const [linkedInType, setLinkedInType] = useState<LinkedInType>('connection');

  // Objection
  const [objectionText, setObjectionText] = useState('');

  // Improve text
  const [textToImprove, setTextToImprove] = useState('');
  const [improveGoal, setImproveGoal] = useState<ImproveGoal>('shorter');

  // Data
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [history, setHistory] = useState<ContentHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [contactsRes, dealsRes, meetingsRes, historyRes] = await Promise.all([
        api.getContacts({ pageSize: 100 }),
        api.getPipelineDeals(),
        api.getMeetings({ pageSize: 50 }),
        api.getAIContentHistory({ limit: 20 }),
      ]);
      setContacts(contactsRes.contacts || []);
      setDeals(dealsRes || []);
      setMeetings(meetingsRes || []);
      setHistory(historyRes || []);
    } catch {
      // Silently fail for data loading
    }
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      switch (generationType) {
        case 'email': {
          const emailResult = await api.generateEmail({
            type: emailType,
            contactId: selectedContact || undefined,
            dealId: selectedDeal || undefined,
            meetingId: selectedMeeting || undefined,
            template: emailTemplate || undefined,
            customInstructions: customInstructions || undefined,
          });
          setResult(emailResult);
          break;
        }
        case 'linkedin': {
          const linkedInResult = await api.generateLinkedInMessage({
            type: linkedInType,
            contactId: selectedContact || undefined,
            customInstructions: customInstructions || undefined,
          });
          setResult(linkedInResult);
          break;
        }
        case 'call-script': {
          const scriptResult = await api.generateCallScript({
            contactId: selectedContact || undefined,
            dealId: selectedDeal || undefined,
            customInstructions: customInstructions || undefined,
          });
          setResult(scriptResult);
          break;
        }
        case 'objection': {
          if (!objectionText.trim()) {
            setError('Please enter an objection to handle');
            return;
          }
          const objectionResult = await api.generateObjectionResponse({
            objection: objectionText,
            contactId: selectedContact || undefined,
            dealId: selectedDeal || undefined,
          });
          setResult(objectionResult);
          break;
        }
        case 'improve': {
          if (!textToImprove.trim()) {
            setError('Please enter text to improve');
            return;
          }
          const improveResult = await api.improveText(textToImprove, improveGoal);
          setResult(improveResult);
          break;
        }
      }
      // Refresh history
      const newHistory = await api.getAIContentHistory({ limit: 20 });
      setHistory(newHistory || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
  }

  const typeLabels: Record<GenerationType, string> = {
    email: 'Email',
    linkedin: 'LinkedIn Message',
    'call-script': 'Call Script',
    objection: 'Objection Response',
    improve: 'Improve Text',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
              AI Writing Assistant
            </h1>
            <p className="text-slate-400 mt-1">
              Generate professional sales content with AI
            </p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors"
          >
            {showHistory ? 'Hide History' : 'View History'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - Configuration */}
          <div className="lg:col-span-1 space-y-6">
            {/* Generation Type Selector */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h3 className="text-lg font-semibold mb-4">Content Type</h3>
              <div className="space-y-2">
                {(Object.keys(typeLabels) as GenerationType[]).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setGenerationType(type);
                      setResult(null);
                    }}
                    className={`w-full px-4 py-3 rounded-lg text-left transition-all ${
                      generationType === type
                        ? 'bg-violet-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {typeLabels[type]}
                  </button>
                ))}
              </div>
            </div>

            {/* Context Selector */}
            {generationType !== 'improve' && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Context</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Contact</label>
                    <select
                      value={selectedContact}
                      onChange={(e) => setSelectedContact(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">Select contact...</option>
                      {contacts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.firstName} {c.lastName} {c.company?.name ? `(${c.company.name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(generationType === 'email' || generationType === 'call-script') && (
                    <>
                      <div>
                        <label className="block text-sm text-slate-400 mb-2">Deal</label>
                        <select
                          value={selectedDeal}
                          onChange={(e) => setSelectedDeal(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500"
                        >
                          <option value="">Select deal...</option>
                          {deals.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name} {d.value ? `($${d.value.toLocaleString()})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {generationType === 'email' && (
                        <div>
                          <label className="block text-sm text-slate-400 mb-2">Meeting (for context)</label>
                          <select
                            value={selectedMeeting}
                            onChange={(e) => setSelectedMeeting(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500"
                          >
                            <option value="">Select meeting...</option>
                            {meetings.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.title} ({m.scheduledAt ? new Date(m.scheduledAt).toLocaleDateString() : 'N/A'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Type-specific Options */}
            {generationType === 'email' && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Email Type</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['follow_up', 'cold', 'reply'] as EmailType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setEmailType(type)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        emailType === type
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {type === 'follow_up' ? 'Follow-up' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
                {emailType === 'cold' && (
                  <div className="mt-4">
                    <label className="block text-sm text-slate-400 mb-2">Template/Inspiration (optional)</label>
                    <textarea
                      value={emailTemplate}
                      onChange={(e) => setEmailTemplate(e.target.value)}
                      placeholder="Paste a template or describe the style you want..."
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500 h-24 resize-none"
                    />
                  </div>
                )}
              </div>
            )}

            {generationType === 'linkedin' && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Message Type</h3>
                <div className="grid grid-cols-3 gap-2">
                  {(['connection', 'inmail', 'reply'] as LinkedInType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => setLinkedInType(type)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        linkedInType === type
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {type === 'connection' ? 'Connect' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {generationType === 'objection' && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Objection</h3>
                <textarea
                  value={objectionText}
                  onChange={(e) => setObjectionText(e.target.value)}
                  placeholder="Enter the objection you need to handle..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500 h-32 resize-none"
                />
              </div>
            )}

            {generationType === 'improve' && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Improvement Goal</h3>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {(['shorter', 'longer', 'formal', 'casual', 'persuasive'] as ImproveGoal[]).map((goal) => (
                    <button
                      key={goal}
                      onClick={() => setImproveGoal(goal)}
                      className={`px-3 py-2 rounded-lg text-sm transition-all ${
                        improveGoal === goal
                          ? 'bg-violet-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {goal.charAt(0).toUpperCase() + goal.slice(1)}
                    </button>
                  ))}
                </div>
                <label className="block text-sm text-slate-400 mb-2">Text to Improve</label>
                <textarea
                  value={textToImprove}
                  onChange={(e) => setTextToImprove(e.target.value)}
                  placeholder="Paste the text you want to improve..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500 h-40 resize-none"
                />
              </div>
            )}

            {/* Custom Instructions */}
            {generationType !== 'improve' && (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-lg font-semibold mb-4">Custom Instructions</h3>
                <textarea
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="Add any specific instructions..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-violet-500 h-24 resize-none"
                />
              </div>
            )}

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-semibold hover:from-violet-700 hover:to-fuchsia-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Generating...
                </span>
              ) : (
                'Generate Content'
              )}
            </button>
          </div>

          {/* Right Panel - Results */}
          <div className="lg:col-span-2">
            {showHistory ? (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h3 className="text-xl font-semibold mb-6">Generation History</h3>
                {history.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No content generated yet</p>
                ) : (
                  <div className="space-y-4">
                    {history.map((item) => (
                      <div key={item.id} className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs px-2 py-1 rounded bg-violet-600/20 text-violet-300">
                            {item.type.replace(/_/g, ' ')}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        {item.title && (
                          <h4 className="font-medium mb-2">{item.title}</h4>
                        )}
                        <p className="text-sm text-slate-300 line-clamp-3">{item.content}</p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => copyToClipboard(item.content)}
                            className="text-xs px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600"
                          >
                            Copy
                          </button>
                          {item.rating && (
                            <span className="text-xs text-yellow-400">
                              {'★'.repeat(item.rating)}{'☆'.repeat(5 - item.rating)}
                            </span>
                          )}
                          {item.isUsed && (
                            <span className="text-xs text-green-400">Used</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 min-h-[600px]">
                <h3 className="text-xl font-semibold mb-6">Generated Content</h3>
                
                {error && (
                  <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg text-red-300 mb-4">
                    {error}
                  </div>
                )}

                {!result && !isGenerating && !error && (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                    </svg>
                    <p>Configure your options and click Generate</p>
                  </div>
                )}

                {isGenerating && (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="w-16 h-16 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-slate-400">Generating your content...</p>
                  </div>
                )}

                {result && generationType === 'email' && (() => {
                  const emailResult = result as { subject: string; body: string; tone: string };
                  return (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Subject Line</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={emailResult.subject}
                          className="flex-1 px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white"
                        />
                        <button
                          onClick={() => copyToClipboard(emailResult.subject)}
                          className="px-4 py-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-slate-400">Email Body</label>
                        <span className={`text-xs px-2 py-1 rounded ${
                          emailResult.tone === 'formal' ? 'bg-blue-600/20 text-blue-300' :
                          emailResult.tone === 'urgent' ? 'bg-red-600/20 text-red-300' :
                          'bg-green-600/20 text-green-300'
                        }`}>
                          {emailResult.tone}
                        </span>
                      </div>
                      <div className="relative">
                        <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white min-h-[300px]">
                          {emailResult.body}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(emailResult.body)}
                          className="absolute top-2 right-2 px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {result && generationType === 'linkedin' && (() => {
                  const linkedInResult = result as { message: string };
                  return (
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">LinkedIn Message</label>
                    <div className="relative">
                      <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white min-h-[200px]">
                        {linkedInResult.message}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(linkedInResult.message)}
                        className="absolute top-2 right-2 px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm"
                      >
                        Copy
                      </button>
                    </div>
                    {linkedInType === 'connection' && (
                      <p className="text-xs text-slate-500 mt-2">
                        Character count: {linkedInResult.message.length}/300
                      </p>
                    )}
                  </div>
                  );
                })()}

                {result && generationType === 'call-script' && (() => {
                  const scriptResult = result as { opening: string; discovery: string[]; pitch: string; objectionHandlers: Record<string, string>; close: string };
                  return (
                  <div className="space-y-6">
                    {/* Opening */}
                    <div>
                      <h4 className="text-sm font-medium text-violet-400 mb-2">Opening</h4>
                      <div className="relative">
                        <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white">
                          {scriptResult.opening}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(scriptResult.opening)}
                          className="absolute top-2 right-2 px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Discovery */}
                    <div>
                      <h4 className="text-sm font-medium text-violet-400 mb-2">Discovery Questions</h4>
                      <ul className="space-y-2">
                        {scriptResult.discovery.map((q, i) => (
                          <li key={i} className="flex items-start gap-3 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700">
                            <span className="text-violet-400 font-mono text-sm">{i + 1}.</span>
                            <span className="flex-1">{q}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Pitch */}
                    <div>
                      <h4 className="text-sm font-medium text-violet-400 mb-2">Value Pitch</h4>
                      <div className="relative">
                        <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white">
                          {scriptResult.pitch}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(scriptResult.pitch)}
                          className="absolute top-2 right-2 px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Objection Handlers */}
                    <div>
                      <h4 className="text-sm font-medium text-violet-400 mb-2">Objection Handlers</h4>
                      <div className="space-y-2">
                        {Object.entries(scriptResult.objectionHandlers).map(([obj, response], i) => (
                          <div key={i} className="px-4 py-3 rounded-lg bg-slate-800 border border-slate-700">
                            <p className="text-red-300 text-sm mb-2">&quot;{obj}&quot;</p>
                            <p className="text-green-300">{response}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Close */}
                    <div>
                      <h4 className="text-sm font-medium text-violet-400 mb-2">Closing</h4>
                      <div className="relative">
                        <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white">
                          {scriptResult.close}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(scriptResult.close)}
                          className="absolute top-2 right-2 px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })()}

                {result && generationType === 'objection' && (() => {
                  const objectionResult = result as { response: string };
                  return (
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">Suggested Response</label>
                    <div className="relative">
                      <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white min-h-[200px]">
                        {objectionResult.response}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(objectionResult.response)}
                        className="absolute top-2 right-2 px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                  );
                })()}

                {result && generationType === 'improve' && (() => {
                  const improveResult = result as { original: string; improved: string };
                  return (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-2">Original</label>
                      <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 line-through">
                        {improveResult.original}
                      </pre>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-slate-400">Improved ({improveGoal})</label>
                      </div>
                      <div className="relative">
                        <pre className="whitespace-pre-wrap font-sans px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white min-h-[200px]">
                          {improveResult.improved}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(improveResult.improved)}
                          className="absolute top-2 right-2 px-3 py-1 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 text-sm"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

