# Omnichannel product strategy

This product direction adapts useful principles from indigitall's overview of
[omnichannel chatbots](https://indigitall.com/en/blog/omnichannel-chatbots-everything-you-need-to-know/)
to Moxnox Omni's current internal use. The article is a market overview, not a
technical specification, so its recommendations are filtered through the
project's risk, scale and privacy constraints.

## Adopted now

### One operational inbox

Instagram, WhatsApp, Messenger and webchat events use one provider-neutral event
shape and one cockpit. Operators can review automation, backlog state and
delivery from the same place.

### Context before intervention

The contact history drawer shows inbound messages, recorded replies,
classifications and review resolutions for the same contact inside the same
connected account. It gives the human operator context without pretending that
unrelated provider IDs identify the same person.

### Hybrid automation

Deterministic rules handle confirmed, repetitive use cases. Sensitive,
unmatched, repeated or explicitly escalated messages go to a person. The bot is
never allowed to trap someone who asks for human support.

### Consistency without repetition

Account-aware copy keeps product facts and tone consistent. A configurable
cooldown stops the same rule from repeating a commercial response to the same
contact within 24 hours and sends the follow-up to human review instead.

### Operational learning

The cockpit tracks automation rate, median first-response time, human-review
resolution rate, pending reviews older than 24 hours, explicit handoffs and
prevented repetitions. These signals support copy and process changes without
silently retraining a model on private conversations.

## Deliberately postponed

- Automatic identity merging across Instagram, WhatsApp and other channels.
  Provider IDs are different and should only be linked with a reliable,
  consented identifier.
- Generative replies and self-learning NLP. There is not yet enough reviewed
  interaction data to justify the accuracy and governance cost.
- Broad CRM/CDP synchronization. The first internal goal is Desejo que Pensa
  engagement and sales; exporting every interaction would expand data risk
  before proving value.
- Email, SMS, voice and proactive campaigns. More channels do not create a
  coherent journey by themselves.

## Evidence gate for the next phase

Run the internal workflow for four to six weeks before expanding it. Review:

- which phrases repeatedly reach human review;
- which rules create qualified leads rather than only replies;
- whether the same person actually moves between channels;
- median response time and reviews older than 24 hours;
- false positives, complaints and manual corrections;
- the minimum contact data genuinely required for follow-up.

Only then consider consented identity linking, a CRM connector or AI-assisted
drafts. AI drafts should begin as suggestions requiring approval, not autonomous
messages.
