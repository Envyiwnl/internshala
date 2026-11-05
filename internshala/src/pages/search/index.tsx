import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useTranslation } from "react-i18next";
import { Search, MapPin, BriefcaseBusiness } from "lucide-react";
import { getLocalizedContent } from "@/utils/getLocalizedContent";

const API_URL = "https://internshala-78tb.onrender.com/api";

type Listing = {
  _id: string;
  title: string;
  company: string;
  category: string;
  location: string;
  aboutCompany?: string;
  aboutJob?: string;
  aboutInternship?: string;
  CTC?: string;
  stipend?: string;
  [key: string]: unknown;
};

type SearchResult = Listing & {
  kind: "job" | "internship";
};

const searchableFields = [
  "title",
  "company",
  "category",
  "location",
  "aboutCompany",
  "aboutJob",
  "aboutInternship",
] as const satisfies readonly (keyof Listing)[];

export default function SearchPage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();

  const [jobs, setJobs] = useState<Listing[]>([]);
  const [internships, setInternships] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = typeof router.query.q === "string" ? router.query.q.trim() : "";

  const language = i18n.resolvedLanguage || i18n.language || "en";

  useEffect(() => {
    const controller = new AbortController();

    const loadListings = async () => {
      setLoading(true);
      setError("");

      try {
        const [jobResponse, internshipResponse] = await Promise.all([
          fetch(`${API_URL}/job`, { signal: controller.signal }),
          fetch(`${API_URL}/internship`, { signal: controller.signal }),
        ]);

        if (!jobResponse.ok || !internshipResponse.ok) {
          throw new Error("SEARCH_FETCH_FAILED");
        }

        const [jobData, internshipData] = await Promise.all([
          jobResponse.json(),
          internshipResponse.json(),
        ]);

        if (controller.signal.aborted) return;

        setJobs(Array.isArray(jobData) ? jobData : []);
        setInternships(Array.isArray(internshipData) ? internshipData : []);
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(err instanceof Error ? err.message : "SEARCH_FETCH_FAILED");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void loadListings();

    return () => controller.abort();
  }, []);

  const results = useMemo(() => {
    if (!query) return [];

    const normalize = (value: string) => value.toLocaleLowerCase().trim();

    const terms = normalize(query).split(/\s+/).filter(Boolean);

    const items: SearchResult[] = [
      ...jobs.map((job) => ({ ...job, kind: "job" as const })),
      ...internships.map((internship) => ({
        ...internship,
        kind: "internship" as const,
      })),
    ];

    return items
      .map((item) => ({
        ...getLocalizedContent(item, language),
        kind: item.kind,
      }))
      .filter((item) => {
        const searchableText = searchableFields
          .map((field) => {
            const value = item[field];
            return typeof value === "string" ? value : "";
          })
          .join(" ")
          .toLocaleLowerCase();

        return terms.every((term) => searchableText.includes(term));
      });
  }, [jobs, internships, query, language]);

  if (!router.isReady || loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12 text-center text-gray-600">
        {t("searchPage.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Search className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              {t("searchPage.title")}
            </h1>
          </div>

          {query && !error && (
            <p className="mt-3 text-gray-600">
              {t("searchPage.results", {
                count: results.length,
                query,
              })}
            </p>
          )}
        </div>

        {error && (
          <div role="alert" className="rounded-xl bg-red-50 p-5 text-red-700">
            {t("searchPage.error")}
          </div>
        )}

        {!error && !query && (
          <div className="rounded-xl bg-white p-6 text-gray-600">
            {t("searchPage.enterQuery")}
          </div>
        )}

        {!error && query && results.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-600">
            {t("searchPage.noResults")}
          </div>
        )}

        {!error && results.length > 0 && (
          <div className="space-y-4">
            {results.map((item) => (
              <article
                key={`${item.kind}-${item._id}`}
                className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm"
              >
                <div className="mb-3 flex items-center gap-2 text-blue-600">
                  <BriefcaseBusiness className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    {item.kind === "job"
                      ? t("navbar.jobs")
                      : t("navbar.internships")}
                  </span>
                </div>

                <h2 className="text-xl font-semibold text-gray-900">
                  {item.title}
                </h2>

                <p className="mt-1 text-gray-600">{item.company}</p>

                <div className="mt-3 flex flex-wrap gap-3 text-sm text-gray-600">
                  <span>{item.category}</span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {item.location}
                  </span>
                  <span>{item.kind === "job" ? item.CTC : item.stipend}</span>
                </div>

                <div className="mt-5">
                  <Link
                    href={
                      item.kind === "job"
                        ? `/detailjob/${item._id}`
                        : `/detailinternship/${item._id}`
                    }
                    className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {t("common.viewDetails")}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
