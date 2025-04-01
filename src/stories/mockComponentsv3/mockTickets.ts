export type Messages = {
  message: string
  humanReadableTimestamp: string
  author: string
  authorType: 'agent' | 'customer'
}[]
export interface Ticket {
  id: number
  subject: string
  messages: Messages
}

export const mockTickets: Ticket[] = [
  {
    id: 1,
    subject: 'My Cat Hacked My Computer',
    messages: [
      {
        message:
          'Help! My cat walked across the keyboard and now everything is upside down.',
        humanReadableTimestamp: 'Today 8:45 AM',
        author: 'John Doe',
        authorType: 'customer',
      },
      {
        message: 'Try pressing Ctrl + Alt + Up Arrow.',
        humanReadableTimestamp: 'Today 8:46 AM',
        author: 'Agent Smith',
        authorType: 'agent',
      },
      {
        message:
          "It worked! But now my cat is staring at me like it's plotting something...",
        humanReadableTimestamp: 'Today 8:47 AM',
        author: 'John Doe',
        authorType: 'customer',
      },
      {
        message: 'Just keep the cat away from the keyboard for now.',
        humanReadableTimestamp: 'Today 8:48 AM',
        author: 'Agent Smith',
        authorType: 'agent',
      },
    ],
  },
  {
    id: 2,
    subject: 'Coffee Spill on Keyboard',
    messages: [
      {
        message:
          "I spilled coffee on my keyboard and now it's typing by itself.",
        humanReadableTimestamp: 'Today 9:00 AM',
        author: 'Jane Smith',
        authorType: 'customer',
      },
      {
        message:
          'Unplug it immediately and let it dry upside down for 24 hours.',
        humanReadableTimestamp: 'Today 9:02 AM',
        author: 'Agent Johnson',
        authorType: 'agent',
      },
      {
        message: "Too late! It's already sending emails to my boss.",
        humanReadableTimestamp: 'Today 9:03 AM',
        author: 'Jane Smith',
        authorType: 'customer',
      },
      {
        message:
          'Try explaining the situation to your boss. In the meantime, get a new keyboard.',
        humanReadableTimestamp: 'Today 9:04 AM',
        author: 'Agent Johnson',
        authorType: 'agent',
      },
    ],
  },
  {
    id: 3,
    subject: 'Printer Only Prints in Pink',
    messages: [
      {
        message:
          "My printer only prints in pink. Everything looks like a Valentine's card.",
        humanReadableTimestamp: 'Feb 08, 9:05 AM',
        author: 'Tom Hanks',
        authorType: 'customer',
      },
      {
        message: 'Check the ink cartridges. It might be out of other colors.',
        humanReadableTimestamp: 'Feb 08, 9:06 AM',
        author: 'Agent Carter',
        authorType: 'agent',
      },
      {
        message:
          "I did. They're full. But now my printer is singing 'Barbie Girl'.",
        humanReadableTimestamp: 'Feb 08, 9:07 AM',
        author: 'Tom Hanks',
        authorType: 'customer',
      },
      {
        message: 'You might need to reset the printer or call an exorcist.',
        humanReadableTimestamp: 'Feb 08, 9:08 AM',
        author: 'Agent Carter',
        authorType: 'agent',
      },
    ],
  },
  {
    id: 4,
    subject: 'Computer Makes Weird Noises',
    messages: [
      {
        message:
          "My computer sounds like it's trying to communicate with whales.",
        humanReadableTimestamp: 'Today 10:00 AM',
        author: 'Bruce Wayne',
        authorType: 'customer',
      },
      {
        message: 'Is it coming from the speakers or the hardware?',
        humanReadableTimestamp: 'Today 10:02 AM',
        author: 'Agent Rogers',
        authorType: 'agent',
      },
      {
        message:
          'From inside the computer. It’s like a tiny opera is happening.',
        humanReadableTimestamp: 'Today 10:03 AM',
        author: 'Bruce Wayne',
        authorType: 'customer',
      },
      {
        message:
          'It might be the fan or a hard drive issue. Can you record the sound?',
        humanReadableTimestamp: 'Today 10:04 AM',
        author: 'Agent Rogers',
        authorType: 'agent',
      },
      {
        message: 'Sure, but don’t blame me if it becomes a hit on YouTube.',
        humanReadableTimestamp: 'Today 10:05 AM',
        author: 'Bruce Wayne',
        authorType: 'customer',
      },
    ],
  },
  {
    id: 5,
    subject: 'Monitor Shows Only Cat Videos',
    messages: [
      {
        message: "My monitor only displays cat videos. I can't do any work.",
        humanReadableTimestamp: 'Today 11:00 AM',
        author: 'Clark Kent',
        authorType: 'customer',
      },
      {
        message: 'Have you tried turning it off and on again?',
        humanReadableTimestamp: 'Today 11:01 AM',
        author: 'Agent Romanoff',
        authorType: 'agent',
      },
      {
        message: 'Yes, but now it’s showing dog videos. Progress, I guess.',
        humanReadableTimestamp: 'Today 11:02 AM',
        author: 'Clark Kent',
        authorType: 'customer',
      },
      {
        message: 'Clear your browser cache and restart your computer.',
        humanReadableTimestamp: 'Today 11:03 AM',
        author: 'Agent Romanoff',
        authorType: 'agent',
      },
      {
        message: 'Okay, back to normal. But now my cat seems disappointed.',
        humanReadableTimestamp: 'Today 11:04 AM',
        author: 'Clark Kent',
        authorType: 'customer',
      },
    ],
  },
  {
    id: 6,
    subject: "Wi-Fi Only Connects to Neighbor's Network",
    messages: [
      {
        message: "My Wi-Fi only connects to my neighbor's network, not mine.",
        humanReadableTimestamp: 'Today 1:00 PM',
        author: 'Diana Prince',
        authorType: 'customer',
      },
      {
        message: "Are you sure you're selecting the correct network?",
        humanReadableTimestamp: 'Today 1:02 PM',
        author: 'Agent Banner',
        authorType: 'agent',
      },
      {
        message:
          "Yes, but my network just vanished. The neighbor’s Wi-Fi is called 'Free Wi-Fi'.",
        humanReadableTimestamp: 'Today 1:03 PM',
        author: 'Diana Prince',
        authorType: 'customer',
      },
      {
        message: 'Try rebooting your router. It might bring your network back.',
        humanReadableTimestamp: 'Today 1:04 PM',
        author: 'Agent Banner',
        authorType: 'agent',
      },
      {
        message: "Got it! My Wi-Fi is back and I renamed it 'Not Free Wi-Fi'.",
        humanReadableTimestamp: 'Today 1:05 PM',
        author: 'Diana Prince',
        authorType: 'customer',
      },
    ],
  },
  {
    id: 7,
    subject: 'Keyboard Types Random Characters',
    messages: [
      {
        message:
          'My keyboard types random characters. It’s like it’s possessed.',
        humanReadableTimestamp: 'Today 2:00 PM',
        author: 'Peter Parker',
        authorType: 'customer',
      },
      {
        message: 'Try unplugging and plugging it back in.',
        humanReadableTimestamp: 'Today 2:02 PM',
        author: 'Agent Romanoff',
        authorType: 'agent',
      },
      {
        message: 'Did that. Now it’s typing in ancient Greek.',
        humanReadableTimestamp: 'Today 2:03 PM',
        author: 'Peter Parker',
        authorType: 'customer',
      },
      {
        message: 'You might need to update your keyboard drivers.',
        humanReadableTimestamp: 'Today 2:04 PM',
        author: 'Agent Romanoff',
        authorType: 'agent',
      },
      {
        message: 'Done. It’s back to English but occasionally types in emojis.',
        humanReadableTimestamp: 'Today 2:05 PM',
        author: 'Peter Parker',
        authorType: 'customer',
      },
    ],
  },
  {
    id: 8,
    subject: 'Email Auto-Correct is Out of Control',
    messages: [
      {
        message: "My email auto-correct is changing 'Regards' to 'Regrets'.",
        humanReadableTimestamp: 'Today 3:00 PM',
        author: 'Tony Stark',
        authorType: 'customer',
      },
      {
        message: 'Check your email settings for auto-correct options.',
        humanReadableTimestamp: 'Today 3:02 PM',
        author: 'Agent Barton',
        authorType: 'agent',
      },
      {
        message: 'Found it. It’s set to ‘Sarcasm Mode’.',
        humanReadableTimestamp: 'Today 3:03 PM',
        author: 'Tony Stark',
        authorType: 'customer',
      },
      {
        message: 'Turn off ‘Sarcasm Mode’ and switch to ‘Professional Mode’.',
        humanReadableTimestamp: 'Today 3:04 PM',
        author: 'Agent Barton',
        authorType: 'agent',
      },
      {
        message: 'Fixed it. Now it changes ‘Regards’ to ‘Best Wishes’.',
        humanReadableTimestamp: 'Today 3:05 PM',
        author: 'Tony Stark',
        authorType: 'customer',
      },
    ],
  },
]
