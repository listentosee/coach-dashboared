interface EmailTemplate {
  subject: string;
  body: string;
}

interface EmailComposerProps {
  to: string;
  from: string;
  template: EmailTemplate;
  onSend?: () => void;
}

export const composeEmail = (to: string, from: string, template: EmailTemplate): string => {
  const mailtoUrl = `mailto:${to}?from=${encodeURIComponent(from)}&subject=${encodeURIComponent(template.subject)}&body=${encodeURIComponent(template.body)}`;
  return mailtoUrl;
};

export const sendEmail = (to: string, from: string, template: EmailTemplate): void => {
  const mailtoUrl = composeEmail(to, from, template);
  window.location.href = mailtoUrl;
};

export const EmailComposer: React.FC<EmailComposerProps> = ({ to, from, template, onSend }) => {
  const handleSend = () => {
    sendEmail(to, from, template);
    onSend?.();
  };

  return (
    <button
      onClick={handleSend}
      className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
    >
      Send Email
    </button>
  );
};

// Predefined email templates
export const emailTemplates = {
  // Note: Keep signature minimal per feedback — end after "Thank you,"
  profileUpdate: (competitorName: string, profileLink: string, _coachName: string): EmailTemplate => ({
    subject: "Mayors Cup Competitor Profile Update Request",
    body: `Dear ${competitorName},

Please navigate to this link:

${profileLink}

Complete your profile to participate in this year's Mayors Cup program.

This secure link expires in 7 days. If it expires before you finish, please ask your coach to send a new one.

Thank you,`
  }),
  
  // Add more templates as needed
  releaseRequest: (competitorName: string, _coachName: string): EmailTemplate => ({
    subject: "Mayors Cup Release Form Request",
    body: `Dear ${competitorName},

Please complete the release form to participate in this year's Mayors Cup program.

Thank you,`
  })
};
