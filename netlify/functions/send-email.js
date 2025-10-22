const fetch = require('node-fetch');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { mentorEmail, mentorName, menteeName, menteeEmail, menteeAvailability, message } = JSON.parse(event.body);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'CyberMentor ME <onboarding@resend.dev>',
        to: mentorEmail,
        subject: `New Mentorship Request from ${menteeName}`,
        html: `
          <h2>New Mentorship Request</h2>
          <p>Hello ${mentorName},</p>
          <p>You have received a new mentorship request!</p>
          
          <h3>Mentee Information:</h3>
          <p><strong>Name:</strong> ${menteeName}</p>
          <p><strong>Email:</strong> ${menteeEmail}</p>
          <p><strong>Availability:</strong> ${menteeAvailability}</p>
          
          <h3>What they want to get out of this mentorship:</h3>
          <p>${message}</p>
          
          <p>You can contact them directly at: ${menteeEmail}</p>
          
          <hr>
          <p><small>CyberMentor ME - Middle East Cybersecurity Mentorship Platform</small></p>
        `
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to send email');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, message: 'Email sent successfully' })
    };
  } catch (error) {
    console.error('Error sending email:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};