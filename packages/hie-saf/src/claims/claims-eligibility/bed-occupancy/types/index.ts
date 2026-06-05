export type BedOccupancyApiReponse = {
  name: string;
  bp_level: string;
  bed_occupancy_rate: {
    total_ip_visits: number;
    icu_visits: number;
    hdu_visits: number;
    normal_ip_visits: number;
    newborn_visits: number;
    dialysis_visits: number;
    total_number_of_bed: number;
    number_of_normal_bed: number;
    number_of_icu_bed: number;
    number_of_hdu_bed: number;
    number_of_dialysis_bed: number;
    number_of_baby_cot: number;
  };
};
