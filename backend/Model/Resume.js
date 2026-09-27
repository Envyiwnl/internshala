const mongoose = require("mongoose");

const educationSchema = new mongoose.Schema(
  {
    institution: String,
    degree: String,
    fieldOfStudy: String,
    startDate: String,
    endDate: String,
    grade: String,
    description: String,
  },
  {
    _id: false,
  },
);

const experienceSchema = new mongoose.Schema(
  {
    company: String,
    position: String,
    location: String,
    startDate: String,
    endDate: String,
    currentlyWorking: {
      type: Boolean,
      default: false,
    },
    description: String,
  },
  {
    _id: false,
  },
);

const internshipSchema = new mongoose.Schema(
  {
    company: String,
    role: String,
    location: String,
    startDate: String,
    endDate: String,
    description: String,
  },
  {
    _id: false,
  },
);

const projectSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    technologies: [String],
    projectUrl: String,
    githubUrl: String,
  },
  {
    _id: false,
  },
);

const certificationSchema = new mongoose.Schema(
  {
    name: String,
    organization: String,
    issueDate: String,
    credentialId: String,
    credentialUrl: String,
  },
  {
    _id: false,
  },
);

const languageSchema = new mongoose.Schema(
  {
    name: String,
    proficiency: String,
  },
  {
    _id: false,
  },
);

const socialLinkSchema = new mongoose.Schema(
  {
    platform: String,
    url: String,
  },
  {
    _id: false,
  },
);

const referenceSchema = new mongoose.Schema(
  {
    name: String,
    designation: String,
    company: String,
    email: String,
    phone: String,
  },
  {
    _id: false,
  },
);

const resumeContentSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      default: "",
    },

    email: {
      type: String,
      default: "",
    },

    phone: {
      type: String,
      default: "",
    },

    address: {
      type: String,
      default: "",
    },

    profilePhoto: {
      type: String,
      default: "",
    },

    careerObjective: {
      type: String,
      default: "",
    },

    education: {
      type: [educationSchema],
      default: [],
    },

    skills: {
      type: [String],
      default: [],
    },

    workExperience: {
      type: [experienceSchema],
      default: [],
    },

    internships: {
      type: [internshipSchema],
      default: [],
    },

    projects: {
      type: [projectSchema],
      default: [],
    },

    certifications: {
      type: [certificationSchema],
      default: [],
    },

    achievements: {
      type: [String],
      default: [],
    },

    languages: {
      type: [languageSchema],
      default: [],
    },

    socialLinks: {
      type: [socialLinkSchema],
      default: [],
    },

    references: {
      type: [referenceSchema],
      default: [],
    },
  },
  {
    _id: false,
  },
);

const customizationSchema = new mongoose.Schema(
  {
    template: {
      type: String,
      enum: ["classic", "modern", "minimal"],
      default: "classic",
    },

    color: {
      type: String,
      default: "#2563EB",
    },

    font: {
      type: String,
      enum: ["Arial", "Helvetica", "Times New Roman", "Georgia"],
      default: "Arial",
    },
  },
  {
    _id: false,
  },
);

const versionSchema = new mongoose.Schema(
  {
    versionNumber: {
      type: Number,
      required: true,
    },

    content: {
      type: resumeContentSchema,
      required: true,
    },

    customization: {
      type: customizationSchema,
      required: true,
    },

    pdfUrl: {
      type: String,
      default: "",
    },

    pdfFileId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ResumePayment",
      default: null,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  },
);

const downloadHistorySchema = new mongoose.Schema(
  {
    versionNumber: {
      type: Number,
      required: true,
    },

    downloadedAt: {
      type: Date,
      default: Date.now,
    },

    ipAddress: {
      type: String,
      default: "",
    },

    userAgent: {
      type: String,
      default: "",
    },
  },
  {
    _id: false,
  },
);

const ResumeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      default: "My Resume",
    },

    content: {
      type: resumeContentSchema,
      default: () => ({}),
    },

    customization: {
      type: customizationSchema,
      default: () => ({}),
    },

    currentVersion: {
      type: Number,
      default: 0,
    },

    versions: {
      type: [versionSchema],
      default: [],
    },

    downloadHistory: {
      type: [downloadHistorySchema],
      default: [],
    },

    status: {
      type: String,
      enum: ["draft", "generated"],
      default: "draft",
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Resume", ResumeSchema);
