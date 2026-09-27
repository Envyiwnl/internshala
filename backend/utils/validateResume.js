const validateResume = (resume) => {
  const errors = [];

  const content = resume?.content || {};

  if (!content.fullName?.trim()) {
    errors.push("FULL_NAME_REQUIRED");
  }

  if (!content.email?.trim()) {
    errors.push("EMAIL_REQUIRED");
  }

  if (!content.phone?.trim()) {
    errors.push("PHONE_REQUIRED");
  }

  if (!content.careerObjective?.trim()) {
    errors.push("CAREER_OBJECTIVE_REQUIRED");
  }

  if (!Array.isArray(content.education) || content.education.length === 0) {
    errors.push("EDUCATION_REQUIRED");
  }

  if (!Array.isArray(content.skills) || content.skills.length === 0) {
    errors.push("SKILLS_REQUIRED");
  }

  const hasValidEducation =
    Array.isArray(content.education) &&
    content.education.some(
      (education) => education.institution?.trim() && education.degree?.trim(),
    );

  if (
    Array.isArray(content.education) &&
    content.education.length > 0 &&
    !hasValidEducation
  ) {
    errors.push("VALID_EDUCATION_REQUIRED");
  }

  const hasValidSkill =
    Array.isArray(content.skills) &&
    content.skills.some((skill) => typeof skill === "string" && skill.trim());

  if (
    Array.isArray(content.skills) &&
    content.skills.length > 0 &&
    !hasValidSkill
  ) {
    errors.push("VALID_SKILL_REQUIRED");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = validateResume;
