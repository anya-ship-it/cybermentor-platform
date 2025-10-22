import React, { useState, useEffect } from 'react';
import { Mail, Users, Shield, Calendar, Globe, BookOpen, CheckCircle, XCircle, Clock, Ban } from 'lucide-react';
import { supabase } from './supabaseClient';

const MentorshipPlatform = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [mentors, setMentors] = useState([]);
  const [pendingMentors, setPendingMentors] = useState([]);
  const [blockedEmails, setBlockedEmails] = useState([]);
  const [newsletterList, setNewsletterList] = useState([]);
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  const [mentorForm, setMentorForm] = useState({
    fullName: '', email: '', linkedIn: '', country: '', languages: '', 
    skills: '', availability: '', courses: '', experience: ''
  });

  const [connectionForm, setConnectionForm] = useState({
    menteeName: '', menteeEmail: '', menteeAvailability: '', message: '', honeypot: ''
  });

  useEffect(() => {
    loadMentors();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    }
  }, [isAdmin]);

  const loadMentors = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('mentors')
        .select('*')
        .eq('status', 'approved')
        .order('registered_at', { ascending: false });

      if (error) throw error;
      setMentors(data || []);
    } catch (error) {
      console.error('Error loading mentors:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [pendingResult, blockedResult, newsletterResult] = await Promise.all([
        supabase.from('mentors').select('*').eq('status', 'pending').order('registered_at', { ascending: false }),
        supabase.from('blocked_emails').select('*').order('blocked_at', { ascending: false }),
        supabase.from('newsletter_subscribers').select('*').order('subscribed_at', { ascending: false })
      ]);

      if (pendingResult.data) setPendingMentors(pendingResult.data);
      if (blockedResult.data) setBlockedEmails(blockedResult.data);
      if (newsletterResult.data) setNewsletterList(newsletterResult.data);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMentorRegistration = async () => {
    if (!mentorForm.fullName || !mentorForm.email || !mentorForm.linkedIn || 
        !mentorForm.country || !mentorForm.languages || !mentorForm.skills || 
        !mentorForm.availability || !mentorForm.experience) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('mentors')
        .insert([{
          full_name: mentorForm.fullName,
          email: mentorForm.email,
          linked_in: mentorForm.linkedIn,
          country: mentorForm.country,
          languages: mentorForm.languages,
          skills: mentorForm.skills,
          availability: mentorForm.availability,
          courses: mentorForm.courses,
          experience: mentorForm.experience,
          status: 'pending'
        }]);

      if (error) throw error;

      alert('Registration submitted! Your profile will be reviewed by an administrator.');
      setMentorForm({
        fullName: '', email: '', linkedIn: '', country: '', languages: '', 
        skills: '', availability: '', courses: '', experience: ''
      });
      setCurrentPage('home');
    } catch (error) {
      console.error('Error registering mentor:', error);
      alert('Error submitting registration. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectionRequest = async () => {
    if (!connectionForm.menteeName || !connectionForm.menteeEmail || 
        !connectionForm.menteeAvailability || !connectionForm.message) {
      alert('Please fill in all fields');
      return;
    }

    if (connectionForm.honeypot) {
      console.log('Spam detected');
      return;
    }

    if (connectionForm.message.length < 120) {
      alert('Please provide at least 120 characters explaining what you want to get out of this mentorship.');
      return;
    }

    setLoading(true);
    try {
      const { data: blockedCheck } = await supabase
        .from('blocked_emails')
        .select('email')
        .eq('email', connectionForm.menteeEmail.toLowerCase())
        .single();

      if (blockedCheck) {
        alert('This email has been blocked from sending requests. Please contact support.');
        setLoading(false);
        return;
      }

      const { data: recentRequests } = await supabase
        .from('connection_requests')
        .select('created_at')
        .eq('mentee_email', connectionForm.menteeEmail.toLowerCase())
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      if (recentRequests && recentRequests.length >= 3) {
        alert('You have reached the maximum number of requests (3) for today. Please try again tomorrow.');
        setLoading(false);
        return;
      }

      const { error: requestError } = await supabase
        .from('connection_requests')
        .insert([{
          mentor_id: selectedMentor.id,
          mentee_name: connectionForm.menteeName,
          mentee_email: connectionForm.menteeEmail.toLowerCase(),
          mentee_availability: connectionForm.menteeAvailability,
          message: connectionForm.message
        }]);

      if (requestError) throw requestError;

      await supabase
        .from('newsletter_subscribers')
        .upsert([{
          email: connectionForm.menteeEmail.toLowerCase(),
          name: connectionForm.menteeName
        }], { onConflict: 'email' });

      const emailResponse = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentorEmail: selectedMentor.email,
          mentorName: selectedMentor.full_name,
          menteeName: connectionForm.menteeName,
          menteeEmail: connectionForm.menteeEmail,
          menteeAvailability: connectionForm.menteeAvailability,
          message: connectionForm.message
        })
      });

      if (!emailResponse.ok) {
        throw new Error('Failed to send email notification');
      }

      alert(`Connection request sent to ${selectedMentor.full_name}! They will receive an email with your information.`);
      
      setConnectionForm({
        menteeName: '', menteeEmail: '', menteeAvailability: '', message: '', honeypot: ''
      });
      setShowConnectionForm(false);
      setSelectedMentor(null);
    } catch (error) {
      console.error('Error sending connection request:', error);
      alert('Error sending request. Please try again or contact the mentor directly at: ' + selectedMentor.email);
    } finally {
      setLoading(false);
    }
  };

  const approveMentor = async (mentorId) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('mentors')
        .update({ status: 'approved' })
        .eq('id', mentorId);

      if (error) throw error;

      alert('Mentor approved successfully!');
      await loadMentors();
      await loadAdminData();
    } catch (error) {
      console.error('Error approving mentor:', error);
      alert('Error approving mentor. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const rejectMentor = async (mentorId) => {
    if (!window.confirm('Are you sure you want to reject this mentor application?')) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('mentors')
        .delete()
        .eq('id', mentorId);

      if (error) throw error;

      alert('Mentor application rejected.');
      await loadAdminData();
    } catch (error) {
      console.error('Error rejecting mentor:', error);
      alert('Error rejecting mentor. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const blockEmail = async (email, reason) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('blocked_emails')
        .insert([{ email: email.toLowerCase(), reason }]);

      if (error) throw error;

      alert('Email blocked successfully!');
      await loadAdminData();
    } catch (error) {
      console.error('Error blocking email:', error);
      alert('Error blocking email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const unblockEmail = async (emailId) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('blocked_emails')
        .delete()
        .eq('id', emailId);

      if (error) throw error;

      alert('Email unblocked successfully!');
      await loadAdminData();
    } catch (error) {
      console.error('Error unblocking email:', error);
      alert('Error unblocking email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const HomePage = () => (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-16">
          <div className="w-32 h-32 mx-auto mb-6 bg-black rounded-2xl flex items-center justify-center">
            <div className="text-7xl font-black text-gray-300" style={{fontFamily: 'system-ui, -apple-system, sans-serif', letterSpacing: '-0.05em'}}>
              m.
            </div>
          </div>
          <h1 className="text-5xl font-bold mb-4 text-black">Middle East Cybersecurity Mentorship</h1>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Connecting aspiring cybersecurity professionals with experienced mentors across the Middle East
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="border-2 border-black p-8 hover:bg-black hover:text-white transition-all cursor-pointer"
               onClick={() => setCurrentPage('mentorRegister')}>
            <Users className="w-12 h-12 mb-4" />
            <h2 className="text-2xl font-bold mb-3">Become a Mentor</h2>
            <p className="mb-4">Share your expertise and guide the next generation of cybersecurity professionals</p>
            <div className="font-semibold">Register as Mentor →</div>
          </div>

          <div className="border-2 border-black p-8 hover:bg-black hover:text-white transition-all cursor-pointer"
               onClick={() => setCurrentPage('directory')}>
            <BookOpen className="w-12 h-12 mb-4" />
            <h2 className="text-2xl font-bold mb-3">Find a Mentor</h2>
            <p className="mb-4">Browse our directory and connect with experienced professionals</p>
            <div className="font-semibold">Browse Directory →</div>
          </div>
        </div>

        <div className="text-center">
          <button
            onClick={() => setCurrentPage('directory')}
            className="bg-black text-white px-8 py-4 text-lg font-bold hover:bg-gray-800 transition-all">
            Browse Mentor Directory
          </button>
        </div>
      </div>
    </div>
  );

  const MentorRegisterPage = () => (
    <div className="min-h-screen bg-white py-12">
      <div className="max-w-3xl mx-auto px-4">
        <button onClick={() => setCurrentPage('home')} className="mb-6 text-black hover:underline">
          ← Back to Home
        </button>
        <h1 className="text-4xl font-bold mb-8 text-black">Register as Mentor</h1>
        <div className="space-y-6">
          <div>
            <label className="block font-bold mb-2 text-black">Full Name *</label>
            <input 
              type="text" 
              value={mentorForm.fullName}
              onInput={(e) => setMentorForm(prev => ({...prev, fullName: e.target.value}))}
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">Email *</label>
            <input 
              type="email" 
              value={mentorForm.email}
             onInput={(e) => setMentorForm(prev => ({...prev, fullName: e.target.value}))}
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">LinkedIn Profile *</label>
            <input 
              type="url" 
              value={mentorForm.linkedIn}
              onInput={(e) => setMentorForm(prev => ({...prev, linkedIn: e.target.value}))}
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
              placeholder="https://linkedin.com/in/yourprofile" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">Country *</label>
            <input 
              type="text" 
              value={mentorForm.country}
              onInput={(e) => setMentorForm(prev => ({...prev, country: e.target.value}))}
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">Languages Spoken *</label>
            <input 
              type="text" 
              value={mentorForm.languages}
              onInput={(e) => setMentorForm(prev => ({...prev, languages: e.target.value}))}
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
              placeholder="e.g., English, Arabic, French" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">Skills & Expertise *</label>
            <textarea 
              value={mentorForm.skills}
              onInput={(e) => setMentorForm(prev => ({...prev, skills: e.target.value}))}
              rows="3"
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
              placeholder="e.g., Penetration Testing, Network Security, Incident Response" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">Availability *</label>
            <textarea 
              value={mentorForm.availability}
              onInput={(e) => setMentorForm(prev => ({...prev, availability: e.target.value}))}
              rows="2"
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
              placeholder="e.g., Weekends, 2 hours per week" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">Courses/Certifications (optional)</label>
            <textarea 
              value={mentorForm.courses}
              onInput={(e) => setMentorForm(prev => ({...prev, courses: e.target.value}))}
              rows="3"
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
              placeholder="e.g., CISSP, CEH, OSCP" 
            />
          </div>

          <div>
            <label className="block font-bold mb-2 text-black">Years of Experience *</label>
            <input 
              type="text" 
              value={mentorForm.experience}
              onInput={(e) => setMentorForm(prev => ({...prev, experience: e.target.value}))}
              className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
            />
          </div>

          <button 
            onClick={handleMentorRegistration}
            disabled={loading}
            className="w-full bg-black text-white py-4 text-lg font-bold hover:bg-gray-800 transition-all disabled:bg-gray-400">
            {loading ? 'Submitting...' : 'Submit Registration'}
          </button>
        </div>
      </div>
    </div>
  );

  const DirectoryPage = () => (
    <div className="min-h-screen bg-white py-12">
      <div className="max-w-6xl mx-auto px-4">
        <button onClick={() => setCurrentPage('home')} className="mb-6 text-black hover:underline">
          ← Back to Home
        </button>
        <h1 className="text-4xl font-bold mb-8 text-black">Mentor Directory</h1>
        
        {loading ? (
          <div className="text-center py-12">
            <p className="text-xl text-gray-600">Loading mentors...</p>
          </div>
        ) : mentors.length === 0 ? (
          <div className="text-center py-12 border-2 border-black">
            <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <p className="text-xl text-gray-600">No mentors available yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {mentors.map(mentor => (
              <div key={mentor.id} className="border-2 border-black p-6 hover:bg-gray-50 transition-all">
                <h3 className="text-2xl font-bold mb-3 text-black">{mentor.full_name}</h3>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-start">
                    <Globe className="w-5 h-5 mr-2 mt-1 flex-shrink-0" />
                    <span><strong>Country:</strong> {mentor.country}</span>
                  </div>
                  
                  <div className="flex items-start">
                    <Mail className="w-5 h-5 mr-2 mt-1 flex-shrink-0" />
                    <span><strong>Languages:</strong> {mentor.languages}</span>
                  </div>
                  
                  <div className="flex items-start">
                    <Shield className="w-5 h-5 mr-2 mt-1 flex-shrink-0" />
                    <span><strong>Skills:</strong> {mentor.skills}</span>
                  </div>
                  
                  <div className="flex items-start">
                    <Calendar className="w-5 h-5 mr-2 mt-1 flex-shrink-0" />
                    <span><strong>Availability:</strong> {mentor.availability}</span>
                  </div>
                  
                  {mentor.courses && (
                    <div className="flex items-start">
                      <BookOpen className="w-5 h-5 mr-2 mt-1 flex-shrink-0" />
                      <span><strong>Certifications:</strong> {mentor.courses}</span>
                    </div>
                  )}
                  
                  <div className="flex items-start">
                    <Clock className="w-5 h-5 mr-2 mt-1 flex-shrink-0" />
                    <span><strong>Experience:</strong> {mentor.experience}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedMentor(mentor);
                    setShowConnectionForm(true);
                  }}
                  className="w-full bg-black text-white py-3 font-bold hover:bg-gray-800 transition-all">
                  Contact Mentor
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const ConnectionFormModal = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto border-4 border-black">
        <div className="p-6">
          <h2 className="text-3xl font-bold mb-4 text-black">Request Mentorship</h2>
          <p className="mb-6 text-gray-700">
            You are requesting mentorship from <strong>{selectedMentor.full_name}</strong>
          </p>
          
          <div className="space-y-4">
            <input 
              type="text" 
              value={connectionForm.honeypot}
              onChange={(e) => setConnectionForm(prev => ({...prev, honeypot: e.target.value}))}
              className="hidden"
              tabIndex="-1"
              autoComplete="off"
            />

            <div>
              <label className="block font-bold mb-2 text-black">Your Full Name *</label>
              <input 
                type="text" 
                value={connectionForm.menteeName}
                onChange={(e) => setConnectionForm(prev => ({...prev, menteeName: e.target.value}))}
                className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-black">Your Email *</label>
              <input 
                type="email" 
                value={connectionForm.menteeEmail}
                onChange={(e) => setConnectionForm(prev => ({...prev, menteeEmail: e.target.value}))}
                className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-black">Your Availability *</label>
              <input 
                type="text" 
                value={connectionForm.menteeAvailability}
                onChange={(e) => setConnectionForm(prev => ({...prev, menteeAvailability: e.target.value}))}
                className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black"
                placeholder="e.g., Weekdays after 6 PM" 
              />
            </div>

            <div>
              <label className="block font-bold mb-2 text-black">
                What do you want to get out of this mentorship? * (minimum 120 characters)
              </label>
              <textarea 
                value={connectionForm.message}
                onChange={(e) => setConnectionForm(prev => ({...prev, message: e.target.value}))}
                rows="6"
                className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black" 
                placeholder="Please describe your goals, what you hope to learn, and why you're interested in this mentor..." 
              />
              <div className="text-sm text-gray-600 mt-1">
                {connectionForm.message.length} / 120 characters
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={handleConnectionRequest}
                disabled={loading}
                className="flex-1 bg-black text-white py-3 font-bold hover:bg-gray-800 transition-all disabled:bg-gray-400">
                {loading ? 'Sending...' : 'Send Request'}
              </button>
              <button 
                onClick={() => {
                  setShowConnectionForm(false);
                  setSelectedMentor(null);
                  setConnectionForm({
                    menteeName: '',
                    menteeEmail: '',
                    menteeAvailability: '',
                    message: '',
                    honeypot: ''
                  });
                }}
                className="flex-1 border-2 border-black py-3 font-bold hover:bg-gray-100 transition-all">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const AdminPage = () => {
    const [adminView, setAdminView] = useState('pending');

    if (!isAdmin) {
      return (
        <div className="min-h-screen bg-white py-12">
          <div className="max-w-md mx-auto px-4">
            <button onClick={() => setCurrentPage('home')} className="mb-6 text-black hover:underline">
              ← Back to Home
            </button>
            <h1 className="text-4xl font-bold mb-8 text-black">Admin Panel</h1>
            <div className="space-y-4">
              <div>
                <label className="block font-bold mb-2 text-black">Admin Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full border-2 border-black p-3 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
              <button 
                onClick={() => {
                  if (adminPassword === 'admin123') {
                    setIsAdmin(true);
                  } else {
                    alert('Incorrect password');
                  }
                }}
                className="w-full bg-black text-white py-3 font-bold hover:bg-gray-800 transition-all">
                Login
              </button>
            </div>
            <p className="mt-4 text-sm text-gray-600">Demo password: admin123</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-white py-12">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <button onClick={() => setCurrentPage('home')} className="text-black hover:underline">
              ← Back to Home
            </button>
            <button onClick={() => {
              setIsAdmin(false);
              setAdminPassword('');
            }} className="text-black hover:underline">
              Logout
            </button>
          </div>
          
          <h1 className="text-4xl font-bold mb-8 text-black">Admin Panel</h1>

          <div className="flex gap-4 mb-8">
            <button
              onClick={() => setAdminView('pending')}
              className={`px-6 py-3 font-bold ${adminView === 'pending' ? 'bg-black text-white' : 'border-2 border-black'}`}>
              Pending Mentors
            </button>
            <button
              onClick={() => setAdminView('newsletter')}
              className={`px-6 py-3 font-bold ${adminView === 'newsletter' ? 'bg-black text-white' : 'border-2 border-black'}`}>
              Newsletter List
            </button>
            <button
              onClick={() => setAdminView('blocked')}
              className={`px-6 py-3 font-bold ${adminView === 'blocked' ? 'bg-black text-white' : 'border-2 border-black'}`}>
              Blocked Emails
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-600">Loading...</p>
            </div>
          ) : adminView === 'pending' ? (
            pendingMentors.length === 0 ? (
              <div className="text-center py-12 border-2 border-black">
                <CheckCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-xl text-gray-600">No pending mentor applications</p>
              </div>
            ) : (
              <div className="space-y-6">
                {pendingMentors.map(mentor => (
                  <div key={mentor.id} className="border-2 border-black p-6">
                    <h3 className="text-2xl font-bold mb-4 text-black">{mentor.full_name}</h3>
                    
                    <div className="grid md:grid-cols-2 gap-4 mb-4">
                      <div><strong>Email:</strong> {mentor.email}</div>
                      <div><strong>Country:</strong> {mentor.country}</div>
                      <div><strong>Languages:</strong> {mentor.languages}</div>
                      <div><strong>Experience:</strong> {mentor.experience}</div>
                      <div className="md:col-span-2"><strong>LinkedIn:</strong> <a href={mentor.linked_in} target="_blank" rel="noopener noreferrer" className="underline">{mentor.linked_in}</a></div>
                      <div className="md:col-span-2"><strong>Skills:</strong> {mentor.skills}</div>
                      <div className="md:col-span-2"><strong>Availability:</strong> {mentor.availability}</div>
                      {mentor.courses && <div className="md:col-span-2"><strong>Certifications:</strong> {mentor.courses}</div>}
                    </div>

                    <div className="flex gap-4">
                      <button
                        onClick={() => approveMentor(mentor.id)}
                        disabled={loading}
                        className="flex-1 bg-black text-white py-3 font-bold hover:bg-gray-800 transition-all flex items-center justify-center disabled:bg-gray-400">
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Approve
                      </button>
                      <button
                        onClick={() => rejectMentor(mentor.id)}
                        disabled={loading}
                        className="flex-1 border-2 border-black py-3 font-bold hover:bg-gray-100 transition-all flex items-center justify-center disabled:bg-gray-400">
                        <XCircle className="w-5 h-5 mr-2" />
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : adminView === 'newsletter' ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Newsletter Subscribers ({newsletterList.length})</h2>
              </div>
              {newsletterList.length === 0 ? (
                <div className="text-center py-12 border-2 border-black">
                  <Mail className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-xl text-gray-600">No newsletter subscribers yet</p>
                </div>
              ) : (
                <div className="border-2 border-black">
                  <table className="w-full">
                    <thead className="bg-black text-white">
                      <tr>
                        <th className="p-3 text-left">Name</th>
                        <th className="p-3 text-left">Email</th>
                        <th className="p-3 text-left">Subscribed Date</th>
                        <th className="p-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {newsletterList.map((sub, index) => (
                        <tr key={sub.id} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="p-3">{sub.name}</td>
                          <td className="p-3">{sub.email}</td>
                          <td className="p-3">{new Date(sub.subscribed_at).toLocaleDateString()}</td>
                          <td className="p-3">
                            <button
                              onClick={() => {
                                const reason = prompt('Why are you blocking this email?');
                                if (reason) blockEmail(sub.email, reason);
                              }}
                              className="text-red-600 hover:underline flex items-center">
                              <Ban className="w-4 h-4 mr-1" />
                              Block
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Blocked Emails ({blockedEmails.length})</h2>
              </div>
              {blockedEmails.length === 0 ? (
                <div className="text-center py-12 border-2 border-black">
                  <Ban className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-xl text-gray-600">No blocked emails</p>
                </div>
              ) : (
                <div className="border-2 border-black">
                  <table className="w-full">
                    <thead className="bg-black text-white">
                      <tr>
                        <th className="p-3 text-left">Email</th>
                        <th className="p-3 text-left">Reason</th>
                        <th className="p-3 text-left">Blocked Date</th>
                        <th className="p-3 text-left">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {blockedEmails.map((blocked, index) => (
                        <tr key={blocked.id} className={index % 2 === 0 ? 'bg-gray-50' : ''}>
                          <td className="p-3">{blocked.email}</td>
                          <td className="p-3">{blocked.reason || 'No reason provided'}</td>
                          <td className="p-3">{new Date(blocked.blocked_at).toLocaleDateString()}</td>
                          <td className="p-3">
                            <button
                              onClick={() => unblockEmail(blocked.id)}
                              className="text-green-600 hover:underline">
                              Unblock
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans">
      <nav className="bg-black text-white p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentPage('home')}>
            <div className="w-10 h-10 bg-white rounded flex items-center justify-center">
              <span className="text-xl font-black text-black" style={{fontFamily: 'system-ui, -apple-system, sans-serif'}}>m.</span>
            </div>
            <span className="font-bold text-lg">CyberMentor ME</span>
          </div>
          <div className="flex gap-6">
            <button onClick={() => setCurrentPage('home')} className="hover:underline">Home</button>
            <button onClick={() => setCurrentPage('directory')} className="hover:underline">Directory</button>
            <button onClick={() => setCurrentPage('admin')} className="hover:underline">Admin</button>
          </div>
        </div>
      </nav>

      {currentPage === 'home' && <HomePage />}
      {currentPage === 'mentorRegister' && <MentorRegisterPage />}
      {currentPage === 'directory' && <DirectoryPage />}
      {currentPage === 'admin' && <AdminPage />}
      {showConnectionForm && <ConnectionFormModal />}
    </div>
  );
};

export default MentorshipPlatform;