const PDFDocument = require("pdfkit");
const axios = require("axios");

const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

const FIREBASE_STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  "internshala-5cde7.firebasestorage.app";

const FONT_MAP = {
  Arial: {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
  },

  Helvetica: {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
  },

  "Times New Roman": {
    regular: "Times-Roman",
    bold: "Times-Bold",
  },

  Georgia: {
    regular: "Times-Roman",
    bold: "Times-Bold",
  },
};

const getFont = (font) => {
  return FONT_MAP[font] || FONT_MAP.Arial;
};

const safeText = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
};

const isAllowedProfilePhotoUrl = (photoUrl) => {
  try {
    const url = new URL(photoUrl);

    if (url.protocol !== "https:") {
      return false;
    }

    if (url.hostname === "lh3.googleusercontent.com") {
      return true;
    }

    if (url.hostname === "firebasestorage.googleapis.com") {
      return url.pathname.startsWith(`/v0/b/${FIREBASE_STORAGE_BUCKET}/o/`);
    }

    return false;
  } catch {
    return false;
  }
};

const addDivider = (doc, color) => {
  doc
    .strokeColor(color)
    .lineWidth(1)
    .moveTo(50, doc.y)
    .lineTo(545, doc.y)
    .stroke();

  doc.moveDown(0.6);
};

const addSectionTitle = (doc, title, color, font, template) => {
  doc.moveDown(0.6);

  if (template === "modern") {
    doc.font(font.bold).fontSize(13).fillColor(color).text(title.toUpperCase());

    addDivider(doc, color);

    return;
  }

  if (template === "minimal") {
    doc.font(font.bold).fontSize(12).fillColor("#222222").text(title);

    doc.moveDown(0.3);

    return;
  }

  doc
    .font(font.bold)
    .fontSize(13)
    .fillColor("#111111")
    .text(title.toUpperCase());

  addDivider(doc, "#444444");
};

const addBulletList = (doc, items, font) => {
  if (!Array.isArray(items)) {
    return;
  }

  items.filter(Boolean).forEach((item) => {
    doc
      .font(font.regular)
      .fontSize(10)
      .fillColor("#333333")
      .text(`• ${safeText(item)}`, {
        indent: 10,
      });
  });
};

const addProfilePhoto = async (doc, photoUrl) => {
  if (!photoUrl) {
    return;
  }

  if (!isAllowedProfilePhotoUrl(photoUrl)) {
    console.error("Rejected unsupported resume profile photo URL.");
    return;
  }

  try {
    const response = await axios.get(photoUrl, {
      responseType: "arraybuffer",
      timeout: 10000,
      maxRedirects: 0,
      maxContentLength: MAX_PROFILE_PHOTO_BYTES,
      maxBodyLength: MAX_PROFILE_PHOTO_BYTES,
      validateStatus: (status) => status === 200,
    });

    const contentType = String(response.headers["content-type"] || "")
      .split(";")[0]
      .trim()
      .toLowerCase();

    if (!["image/jpeg", "image/png"].includes(contentType)) {
      throw new Error("UNSUPPORTED_PROFILE_PHOTO_TYPE");
    }

    const imageBuffer = Buffer.from(response.data);

    if (
      imageBuffer.length === 0 ||
      imageBuffer.length > MAX_PROFILE_PHOTO_BYTES
    ) {
      throw new Error("INVALID_PROFILE_PHOTO_SIZE");
    }

    doc.image(imageBuffer, 465, 45, {
      fit: [70, 70],
      align: "center",
      valign: "center",
    });
  } catch (error) {
    console.error("Resume profile photo load failed:", error.message);
  }
};

const addEducation = (doc, education, font) => {
  if (!Array.isArray(education)) {
    return;
  }

  education.forEach((item) => {
    const degreeLine = [item.degree, item.fieldOfStudy]
      .filter(Boolean)
      .join(" - ");

    doc.font(font.bold).fontSize(10.5).fillColor("#222222").text(degreeLine);

    if (item.institution) {
      doc
        .font(font.regular)
        .fontSize(10)
        .fillColor("#444444")
        .text(item.institution);
    }

    const dateLine = [item.startDate, item.endDate].filter(Boolean).join(" - ");

    if (dateLine) {
      doc.font(font.regular).fontSize(9).fillColor("#666666").text(dateLine);
    }

    if (item.grade) {
      doc
        .font(font.regular)
        .fontSize(9.5)
        .fillColor("#444444")
        .text(`Grade: ${item.grade}`);
    }

    if (item.description) {
      doc
        .font(font.regular)
        .fontSize(9.5)
        .fillColor("#444444")
        .text(item.description);
    }

    doc.moveDown(0.5);
  });
};

const addExperience = (doc, items, font, roleKey) => {
  if (!Array.isArray(items)) {
    return;
  }

  items.forEach((item) => {
    const role = item[roleKey] || item.position || item.role || "";

    doc.font(font.bold).fontSize(10.5).fillColor("#222222").text(role);

    if (item.company) {
      doc
        .font(font.regular)
        .fontSize(10)
        .fillColor("#444444")
        .text(item.company);
    }

    const endDate = item.currentlyWorking === true ? "Present" : item.endDate;

    const metadata = [
      item.location,
      [item.startDate, endDate].filter(Boolean).join(" - "),
    ]
      .filter(Boolean)
      .join(" | ");

    if (metadata) {
      doc.font(font.regular).fontSize(9).fillColor("#666666").text(metadata);
    }

    if (item.description) {
      doc
        .font(font.regular)
        .fontSize(9.5)
        .fillColor("#444444")
        .text(item.description);
    }

    doc.moveDown(0.5);
  });
};

const addProjects = (doc, projects, font) => {
  if (!Array.isArray(projects)) {
    return;
  }

  projects.forEach((project) => {
    doc
      .font(font.bold)
      .fontSize(10.5)
      .fillColor("#222222")
      .text(project.title || "");

    if (Array.isArray(project.technologies) && project.technologies.length) {
      doc
        .font(font.regular)
        .fontSize(9)
        .fillColor("#555555")
        .text(project.technologies.join(", "));
    }

    if (project.description) {
      doc
        .font(font.regular)
        .fontSize(9.5)
        .fillColor("#444444")
        .text(project.description);
    }

    if (project.projectUrl) {
      doc
        .font(font.regular)
        .fontSize(9)
        .fillColor("#2563EB")
        .text(project.projectUrl);
    }

    if (project.githubUrl) {
      doc
        .font(font.regular)
        .fontSize(9)
        .fillColor("#2563EB")
        .text(project.githubUrl);
    }

    doc.moveDown(0.5);
  });
};

const addCertifications = (doc, certifications, font) => {
  if (!Array.isArray(certifications)) {
    return;
  }

  certifications.forEach((certification) => {
    doc
      .font(font.bold)
      .fontSize(10)
      .fillColor("#222222")
      .text(certification.name || "");

    const details = [certification.organization, certification.issueDate]
      .filter(Boolean)
      .join(" | ");

    if (details) {
      doc.font(font.regular).fontSize(9).fillColor("#555555").text(details);
    }

    if (certification.credentialId) {
      doc
        .font(font.regular)
        .fontSize(9)
        .fillColor("#555555")
        .text(`Credential ID: ${certification.credentialId}`);
    }

    if (certification.credentialUrl) {
      doc
        .font(font.regular)
        .fontSize(9)
        .fillColor("#2563EB")
        .text(certification.credentialUrl);
    }

    doc.moveDown(0.4);
  });
};

const addLanguages = (doc, languages, font) => {
  if (!Array.isArray(languages)) {
    return;
  }

  const values = languages
    .filter((language) => language.name)
    .map((language) => {
      if (language.proficiency) {
        return `${language.name} (${language.proficiency})`;
      }

      return language.name;
    });

  if (values.length) {
    doc
      .font(font.regular)
      .fontSize(10)
      .fillColor("#333333")
      .text(values.join(", "));
  }
};

const addSocialLinks = (doc, links, font) => {
  if (!Array.isArray(links)) {
    return;
  }

  links.forEach((link) => {
    if (!link.url) {
      return;
    }

    const label = link.platform ? `${link.platform}: ${link.url}` : link.url;

    doc.font(font.regular).fontSize(9.5).fillColor("#2563EB").text(label);
  });
};

const addReferences = (doc, references, font) => {
  if (!Array.isArray(references)) {
    return;
  }

  references.forEach((reference) => {
    doc
      .font(font.bold)
      .fontSize(10)
      .fillColor("#222222")
      .text(reference.name || "");

    const details = [reference.designation, reference.company]
      .filter(Boolean)
      .join(", ");

    if (details) {
      doc.font(font.regular).fontSize(9.5).fillColor("#444444").text(details);
    }

    const contact = [reference.email, reference.phone]
      .filter(Boolean)
      .join(" | ");

    if (contact) {
      doc.font(font.regular).fontSize(9).fillColor("#555555").text(contact);
    }

    doc.moveDown(0.4);
  });
};

const generateResumePdf = async ({ content, customization }) => {
  return new Promise(async (resolve, reject) => {
    try {
      const chunks = [];

      const doc = new PDFDocument({
        size: "A4",
        margins: {
          top: 45,
          bottom: 45,
          left: 50,
          right: 50,
        },
        info: {
          Title: `${content.fullName || "Resume"} Resume`,
          Author: content.fullName || "",
        },
      });

      doc.on("data", (chunk) => {
        chunks.push(chunk);
      });

      doc.on("end", () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on("error", reject);

      const template = customization?.template || "classic";

      const color = customization?.color || "#2563EB";

      const font = getFont(customization?.font);

      if (template === "modern") {
        doc.rect(0, 0, 595, 125).fill(color);

        doc
          .font(font.bold)
          .fontSize(24)
          .fillColor("#FFFFFF")
          .text(safeText(content.fullName), 50, 48, {
            width: content.profilePhoto ? 390 : 495,
          });

        const contactInfo = [content.email, content.phone, content.address]
          .filter(Boolean)
          .join(" | ");

        doc
          .font(font.regular)
          .fontSize(9.5)
          .fillColor("#FFFFFF")
          .text(contactInfo, 50, 82, {
            width: content.profilePhoto ? 390 : 495,
          });

        if (content.profilePhoto) {
          await addProfilePhoto(doc, content.profilePhoto);
        }

        doc.y = 145;
      } else {
        doc
          .font(font.bold)
          .fontSize(template === "minimal" ? 22 : 24)
          .fillColor(template === "minimal" ? "#111111" : color)
          .text(safeText(content.fullName));

        const contactInfo = [content.email, content.phone, content.address]
          .filter(Boolean)
          .join(" | ");

        doc
          .font(font.regular)
          .fontSize(9.5)
          .fillColor("#555555")
          .text(contactInfo);

        doc.moveDown(0.5);

        if (template === "classic") {
          addDivider(doc, color);
        }
      }

      if (content.careerObjective) {
        addSectionTitle(doc, "Career Objective", color, font, template);

        doc
          .font(font.regular)
          .fontSize(10)
          .fillColor("#333333")
          .text(content.careerObjective);
      }

      if (Array.isArray(content.education) && content.education.length) {
        addSectionTitle(doc, "Education", color, font, template);

        addEducation(doc, content.education, font);
      }

      if (Array.isArray(content.skills) && content.skills.length) {
        addSectionTitle(doc, "Skills", color, font, template);

        addBulletList(doc, content.skills, font);
      }

      if (
        Array.isArray(content.workExperience) &&
        content.workExperience.length
      ) {
        addSectionTitle(doc, "Work Experience", color, font, template);

        addExperience(doc, content.workExperience, font, "position");
      }

      if (Array.isArray(content.internships) && content.internships.length) {
        addSectionTitle(doc, "Internships", color, font, template);

        addExperience(doc, content.internships, font, "role");
      }

      if (Array.isArray(content.projects) && content.projects.length) {
        addSectionTitle(doc, "Projects", color, font, template);

        addProjects(doc, content.projects, font);
      }

      if (
        Array.isArray(content.certifications) &&
        content.certifications.length
      ) {
        addSectionTitle(doc, "Certifications", color, font, template);

        addCertifications(doc, content.certifications, font);
      }

      if (Array.isArray(content.achievements) && content.achievements.length) {
        addSectionTitle(doc, "Achievements", color, font, template);

        addBulletList(doc, content.achievements, font);
      }

      if (Array.isArray(content.languages) && content.languages.length) {
        addSectionTitle(doc, "Languages", color, font, template);

        addLanguages(doc, content.languages, font);
      }

      if (Array.isArray(content.socialLinks) && content.socialLinks.length) {
        addSectionTitle(doc, "Social Links", color, font, template);

        addSocialLinks(doc, content.socialLinks, font);
      }

      if (Array.isArray(content.references) && content.references.length) {
        addSectionTitle(doc, "References", color, font, template);

        addReferences(doc, content.references, font);
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateResumePdf,
};
