// Fotos em destaque do Wikimedia Commons, escolhidas pelas cores intensas.
// Uma por dia, em ciclo de 63 dias. O service worker baixa o original e reduz para 4k.
export const BACKDROPS = [
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/0/07/Virmalised_18.03.15_%282%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Virmalised_18.03.15_(2).jpg",
  "title": "Virmalised 18.03.15",
  "author": "Kristian Pikner",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/86/Lofoten%2C_Norway_%28Unsplash%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Lofoten,_Norway_(Unsplash).jpg",
  "title": "Lofoten, Norway",
  "author": "Johannes Groll followhansi",
  "license": "CC0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/e/e7/Maardu_Northern_lights_%E2%80%94_Estonia%2C_2022.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Maardu_Northern_lights_%E2%80%94_Estonia,_2022.jpg",
  "title": "Maardu Northern lights — Estonia, 2022",
  "author": "Maxim Bilovitskiy",
  "license": "CC BY 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/e/e3/Magenta_G5_aurora_over_Tuntorp%2C_Lysekil_Municipality_11.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Magenta_G5_aurora_over_Tuntorp,_Lysekil_Municipality_11.jpg",
  "title": "Magenta G5 aurora over Tuntorp, Lysekil Municipality 11",
  "author": "W.carter",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/3/31/Aurora_and_perseids.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Aurora_and_perseids.jpg",
  "title": "Aurora and perseids",
  "author": "Stephan Sprinz",
  "license": "CC BY 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/9/9d/G5_aurora_over_Tuntorp%2C_Lysekil_Municipality_15.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:G5_aurora_over_Tuntorp,_Lysekil_Municipality_15.jpg",
  "title": "G5 aurora over Tuntorp, Lysekil Municipality 15",
  "author": "W.carter",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/7/76/Zorza_polarna%2C_Lucim-01.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Zorza_polarna,_Lucim-01.jpg",
  "title": "Zorza polarna, Lucim-01",
  "author": "Aneta p",
  "license": "CC BY 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/6/6a/Kitesurfer_at_sunset%2C_Workum%2C_may_2017.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Kitesurfer_at_sunset,_Workum,_may_2017.jpg",
  "title": "Kitesurfer at sunset, Workum, may 2017",
  "author": "Villy Fink Isaksen",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/84/2018_-_Nyhavn_on_sunset.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:2018_-_Nyhavn_on_sunset.jpg",
  "title": "2018 - Nyhavn on sunset",
  "author": "Moahim",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/c/c6/Sunset_-_Port_Launey_Road_-_Port_Glaud_-_Mahe_-_Seychelles_-_2.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Sunset_-_Port_Launey_Road_-_Port_Glaud_-_Mahe_-_Seychelles_-_2.jpg",
  "title": "Sunset - Port Launey Road - Port Glaud - Mahe - Seychelles -",
  "author": "NorbertNagel",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/a/a1/Laanemaa_j%C3%A4rv_Orkj%C3%A4rve_looduskaitsealal.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Laanemaa_j%C3%A4rv_Orkj%C3%A4rve_looduskaitsealal.jpg",
  "title": "Laanemaa järv Orkjärve looduskaitsealal",
  "author": "Heino Ruiso",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/8a/Wsch%C3%B3d_s%C5%82o%C5%84ca_nad_Kana%C5%82em_%C5%81%C4%85cza%C5%84skim_w_Brze%C5%BAnicy%2C_20211009_0711_3152.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Wsch%C3%B3d_s%C5%82o%C5%84ca_nad_Kana%C5%82em_%C5%81%C4%85cza%C5%84skim_w_Brze%C5%BAnicy,_20211009_0711_3152.jpg",
  "title": "Wschód słońca nad Kanałem Łączańskim w Brzeźnicy, 20211009 0",
  "author": "Jakub Hałun",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/5/59/Red_clouds_over_Mekong_banks_with_dwellings_and_pirogues_at_sunrise_in_Don_Det_Laos.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Red_clouds_over_Mekong_banks_with_dwellings_and_pirogues_at_sunrise_in_Don_Det_Laos.jpg",
  "title": "Red clouds over Mekong banks with dwellings and pirogues at ",
  "author": "Basile Morin",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/d/d6/D%C3%BClmen%2C_Hausd%C3%BClmen%2C_Sonnenaufgang_--_2015_--_4952.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Hausd%C3%BClmen,_Sonnenaufgang_--_2015_--_4952.jpg",
  "title": "Dülmen, Hausdülmen, Sonnenaufgang -- 2015 -- 4952",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/0/00/Center_of_the_Milky_Way_Galaxy_IV_%E2%80%93_Composite.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Center_of_the_Milky_Way_Galaxy_IV_%E2%80%93_Composite.jpg",
  "title": "Center of the Milky Way Galaxy IV – Composite",
  "author": "NASA/JPL-Caltech/ESA/CXC/STScI",
  "license": "Public domain"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/0/03/Milky_way_seen_from_bolivian_high_altiplano_03.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Milky_way_seen_from_bolivian_high_altiplano_03.jpg",
  "title": "Milky way seen from bolivian high altiplano 03",
  "author": "Thomas Fuhrmann",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/1/14/%C3%8Ele_d%27Orl%C3%A9ans_009.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:%C3%8Ele_d%27Orl%C3%A9ans_009.jpg",
  "title": "Île d'Orléans 009",
  "author": "Wilfredor",
  "license": "CC0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/0/05/Tulpenfelder-Neuss-Kapellen-01-2016.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Tulpenfelder-Neuss-Kapellen-01-2016.jpg",
  "title": "Tulpenfelder-Neuss-Kapellen-01-2016",
  "author": "Tuxyso",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/5/52/Porto_Alegre_-_Brazil_Landscape-Night.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Porto_Alegre_-_Brazil_Landscape-Night.jpg",
  "title": "Porto Alegre - Brazil Landscape-Night",
  "author": "Felipe Valduga from Porto Alegre, Brazil",
  "license": "CC BY 2.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/8b/Price_Building_illuminated_at_night_in_Quebec_City.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Price_Building_illuminated_at_night_in_Quebec_City.jpg",
  "title": "Price Building illuminated at night in Quebec City",
  "author": "Wilfredor",
  "license": "CC0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/6/6d/Tokyo_Tower%2C_Minato_City.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Tokyo_Tower,_Minato_City.jpg",
  "title": "Tokyo Tower, Minato City",
  "author": "David Kernan",
  "license": "CC BY 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/4/4b/2013-08-07_04-23-26-foudre-belfort.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:2013-08-07_04-23-26-foudre-belfort.jpg",
  "title": "2013-08-07 04-23-26-foudre-belfort",
  "author": "Thomas Bresson",
  "license": "CC BY 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/c/c2/Port_and_lighthouse_overnight_storm_with_lightning_in_Port-la-Nouvelle.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Port_and_lighthouse_overnight_storm_with_lightning_in_Port-la-Nouvelle.jpg",
  "title": "Port and lighthouse overnight storm with lightning in Port-l",
  "author": "Maxime Raynal from France",
  "license": "CC BY 2.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/e/ef/D%C3%BClmen%2C_B%C3%B6rnste%2C_Waldweg_--_2015_--_4649.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_B%C3%B6rnste,_Waldweg_--_2015_--_4649.jpg",
  "title": "Dülmen, Börnste, Waldweg -- 2015 -- 4649",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/89/M%C3%BCnster%2C_Park_Sentmaring_--_2015_--_9923.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:M%C3%BCnster,_Park_Sentmaring_--_2015_--_9923.jpg",
  "title": "Münster, Park Sentmaring -- 2015 -- 9923",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/6/66/National_road_970_and_river_Teno_near_Gistugurra%2C_Utsjoki%2C_Lapland%2C_Finland%2C_2021_September.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:National_road_970_and_river_Teno_near_Gistugurra,_Utsjoki,_Lapland,_Finland,_2021_September.jpg",
  "title": "National road 970 and river Teno near Gistugurra, Utsjoki, L",
  "author": "Ximonic (Simo Räsänen)",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/f/f3/MTAB_IORE_133_and_105_Kaisepakte_-_Stenbacken.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:MTAB_IORE_133_and_105_Kaisepakte_-_Stenbacken.jpg",
  "title": "MTAB IORE 133 and 105 Kaisepakte - Stenbacken",
  "author": "Kabelleger / David Gubler",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/9/93/Sk%C3%A4ralid_in_S%C3%B6der%C3%A5sen_National_Park_121020_01.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Sk%C3%A4ralid_in_S%C3%B6der%C3%A5sen_National_Park_121020_01.jpg",
  "title": "Skäralid in Söderåsen National Park 121020 01",
  "author": "Auquamitzi",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/5/5e/21-224-5054_NNP_Synevyr_RB_18.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:21-224-5054_NNP_Synevyr_RB_18.jpg",
  "title": "21-224-5054 NNP Synevyr RB 18",
  "author": "Rbrechko",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/89/Cappadocia_Balloon_Inflating_Wikimedia_Commons.JPG?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Cappadocia_Balloon_Inflating_Wikimedia_Commons.JPG",
  "title": "Cappadocia Balloon Inflating Wikimedia Commons",
  "author": "Benh LIEU SONG (Flickr)",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/d/da/Dawn_Patrol.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Dawn_Patrol.jpg",
  "title": "Dawn Patrol",
  "author": "Frank Schulenburg",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/e/e6/Tavurvur_volcano_edit.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Tavurvur_volcano_edit.jpg",
  "title": "Tavurvur volcano edit",
  "author": "Taro Taylor edit by Richard Bartz",
  "license": "CC BY 2.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/3/37/Fimmvorduhals_2010_03_27_dawn.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Fimmvorduhals_2010_03_27_dawn.jpg",
  "title": "Fimmvorduhals 2010 03 27 dawn",
  "author": "Boaworm",
  "license": "CC BY 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/d/d4/ET_Afar_asv2018-01_img48_Dallol.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:ET_Afar_asv2018-01_img48_Dallol.jpg",
  "title": "ET Afar asv2018-01 img48 Dallol",
  "author": "A.Savin",
  "license": "FAL"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/1/19/Hydrangea_macrophylla_in_front_of_Seongsan_Ilchulbong_volcano_at_blue_hour_in_Jeju_Island_South_Korea.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Hydrangea_macrophylla_in_front_of_Seongsan_Ilchulbong_volcano_at_blue_hour_in_Jeju_Island_South_Korea.jpg",
  "title": "Hydrangea macrophylla in front of Seongsan Ilchulbong volcan",
  "author": "Basile Morin",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/7/7b/Grand_Canyon_Hopi_Point_with_rainbow_2013.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Grand_Canyon_Hopi_Point_with_rainbow_2013.jpg",
  "title": "Grand Canyon Hopi Point with rainbow 2013",
  "author": "Tuxyso",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/7/70/Sunrise_Point_Bryce_Canyon_November_2018_HDR.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Sunrise_Point_Bryce_Canyon_November_2018_HDR.jpg",
  "title": "Sunrise Point Bryce Canyon November 2018 HDR",
  "author": "King of Hearts",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/c/c3/Inspiration_Point_Bryce_Canyon_November_2018_panorama.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Inspiration_Point_Bryce_Canyon_November_2018_panorama.jpg",
  "title": "Inspiration Point Bryce Canyon November 2018 panorama",
  "author": "King of Hearts",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/a/a3/Crimea%2C_Ai-Petri%2C_low_clouds.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Crimea,_Ai-Petri,_low_clouds.jpg",
  "title": "Crimea, Ai-Petri, low clouds",
  "author": "Dmytro Balkhovitin",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/4/4c/Contrasts_of_Rio_de_Janeiro_-_Rocinha%2C_Ipanema%2C_and_Mountains_at_Sunrise.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Contrasts_of_Rio_de_Janeiro_-_Rocinha,_Ipanema,_and_Mountains_at_Sunrise.jpg",
  "title": "Contrasts of Rio de Janeiro - Rocinha, Ipanema, and Mountain",
  "author": "Donatas Dabravolskas",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/82/Petani_padi.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Petani_padi.jpg",
  "title": "Petani padi",
  "author": "Imadedana",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/7/75/Aux_aurores_sur_la_Cresta_Signal.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Aux_aurores_sur_la_Cresta_Signal.jpg",
  "title": "Aux aurores sur la Cresta Signal",
  "author": "Nicola Beltraminelli",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/5/52/68-104-9007_Kamianets-Podilskyi_Fortress_RB_18_2.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:68-104-9007_Kamianets-Podilskyi_Fortress_RB_18_2.jpg",
  "title": "68-104-9007 Kamianets-Podilskyi Fortress RB 18 2",
  "author": "Rbrechko",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/d/d5/Kilchurn_Castle_at_sunrise.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Kilchurn_Castle_at_sunrise.jpg",
  "title": "Kilchurn Castle at sunrise",
  "author": "MHoser",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/a/ae/1_singapore_national_day_parade_2011_fireworks.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:1_singapore_national_day_parade_2011_fireworks.jpg",
  "title": "1 singapore national day parade 2011 fireworks",
  "author": "chensiyuan",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/0/08/Australia_Day_2013_Perth_39.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Australia_Day_2013_Perth_39.jpg",
  "title": "Australia Day 2013 Perth 39",
  "author": "Kaoz69",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/6/6b/%D0%A4%D0%B5%D0%B9%D0%B5%D1%80%D0%B2%D0%B5%D1%80%D0%BA_%D0%B2_%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%BC_%D0%BF%D0%BE%D1%80%D1%82%D1%83_%D0%A1%D0%BE%D1%87%D0%B8_9_%D0%BC%D0%B0%D1%8F_2015_%D0%B3%D0%BE%D0%B4%D0%B0.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:%D0%A4%D0%B5%D0%B9%D0%B5%D1%80%D0%B2%D0%B5%D1%80%D0%BA_%D0%B2_%D0%BC%D0%BE%D1%80%D1%81%D0%BA%D0%BE%D0%BC_%D0%BF%D0%BE%D1%80%D1%82%D1%83_%D0%A1%D0%BE%D1%87%D0%B8_9_%D0%BC%D0%B0%D1%8F_2015_%D0%B3%D0%BE%D0%B4%D0%B0.jpg",
  "title": "Фейерверк в морском порту Сочи 9 мая 2015 года",
  "author": "Илья Бунин",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/6/6b/M%C3%BCnster%2C_Schlossplatz%2C_Fr%C3%BChjahrssend_--_2019_--_4208.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:M%C3%BCnster,_Schlossplatz,_Fr%C3%BChjahrssend_--_2019_--_4208.jpg",
  "title": "Münster, Schlossplatz, Frühjahrssend -- 2019 -- 4208",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/9/93/M%C3%BCnster%2C_Schlossplatz%2C_Herbstsend%2C_Kettenkarussell_--_2024_--_6459.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:M%C3%BCnster,_Schlossplatz,_Herbstsend,_Kettenkarussell_--_2024_--_6459.jpg",
  "title": "Münster, Schlossplatz, Herbstsend, Kettenkarussell -- 2024 -",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/3/3f/D%C3%BClmen%2C_Viktorkirmes_auf_dem_Overbergplatz_--_2014_--_3738_%282%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:D%C3%BClmen,_Viktorkirmes_auf_dem_Overbergplatz_--_2014_--_3738_(2).jpg",
  "title": "Dülmen, Viktorkirmes auf dem Overbergplatz -- 2014 -- 3738",
  "author": "Dietmar Rabich",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/d/dc/Colorful_neon_street_signs_in_Kabukich%C5%8D%2C_Shinjuku%2C_Tokyo.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Colorful_neon_street_signs_in_Kabukich%C5%8D,_Shinjuku,_Tokyo.jpg",
  "title": "Colorful neon street signs in Kabukichō, Shinjuku, Tokyo",
  "author": "Basile Morin",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/8/89/Namib-Naukluft_Sand_Dunes_%282011%29.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Namib-Naukluft_Sand_Dunes_(2011).jpg",
  "title": "Namib-Naukluft Sand Dunes",
  "author": "Yathin S Krishnappa",
  "license": "CC BY-SA 3.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/2/2a/Duna_en_Sossusvlei%2C_Namibia%2C_2018-08-06%2C_DD_002.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Duna_en_Sossusvlei,_Namibia,_2018-08-06,_DD_002.jpg",
  "title": "Duna en Sossusvlei, Namibia, 2018-08-06, DD 002",
  "author": "Diego Delso",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/c/cb/Utah_Dunes_Landscape_-_West_Desert_District.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Utah_Dunes_Landscape_-_West_Desert_District.jpg",
  "title": "Utah Dunes Landscape - West Desert District",
  "author": "Bureau of Land Management - Utah/Bob Wick",
  "license": "Public domain"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/2/2e/006_Dune_45_in_Sossusvlei_at_sunrise_Photo_by_Giles_Laurent.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:006_Dune_45_in_Sossusvlei_at_sunrise_Photo_by_Giles_Laurent.jpg",
  "title": "006 Dune 45 in Sossusvlei at sunrise Photo by Giles Laurent",
  "author": "Giles Laurent",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/3/3a/Three_pink_cherry_blossoms_in_Tuntorp.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Three_pink_cherry_blossoms_in_Tuntorp.jpg",
  "title": "Three pink cherry blossoms in Tuntorp",
  "author": "W.carter",
  "license": "CC BY 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/3/3d/Iceberg_in_the_Arctic_with_its_underside_exposed.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Iceberg_in_the_Arctic_with_its_underside_exposed.jpg",
  "title": "Iceberg in the Arctic with its underside exposed",
  "author": "AWeith",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/1/1a/%D0%9B%D0%B5%D0%B4%D1%8F%D0%BD%D1%8B%D0%B5_%D0%BF%D0%B0%D1%80%D1%83%D1%81%D0%BD%D0%B8%D0%BA%D0%B8.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:%D0%9B%D0%B5%D0%B4%D1%8F%D0%BD%D1%8B%D0%B5_%D0%BF%D0%B0%D1%80%D1%83%D1%81%D0%BD%D0%B8%D0%BA%D0%B8.jpg",
  "title": "Ледяные парусники",
  "author": "Discoverynn",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/a/a0/The_underwater_surface_structures_of_an_iceberg_in_Svalbard.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:The_underwater_surface_structures_of_an_iceberg_in_Svalbard.jpg",
  "title": "The underwater surface structures of an iceberg in Svalbard",
  "author": "Andreas Weith",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/d/d0/024_Aerial_view_of_Jakobshavn_Glacier_at_Disko_Bay_%28Greenland%29_Photo_by_Giles_Laurent.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:024_Aerial_view_of_Jakobshavn_Glacier_at_Disko_Bay_(Greenland)_Photo_by_Giles_Laurent.jpg",
  "title": "024 Aerial view of Jakobshavn Glacier at Disko Bay Photo by ",
  "author": "Giles Laurent",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/3/32/Diamonds_Thudufushi_Beach_and_Water_Villas%2C_May_2017_-08.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Diamonds_Thudufushi_Beach_and_Water_Villas,_May_2017_-08.jpg",
  "title": "Diamonds Thudufushi Beach and Water Villas, May 2017 -08",
  "author": "Martin Falbisoner",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/0/0b/Field_of_Iceland_poppies_in_the_flower_garden_near_Cheomseongdae_Observatory_in_Gyeongju_South_Korea.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:Field_of_Iceland_poppies_in_the_flower_garden_near_Cheomseongdae_Observatory_in_Gyeongju_South_Korea.jpg",
  "title": "Field of Iceland poppies in the flower garden near Cheomseon",
  "author": "Basile Morin",
  "license": "CC BY-SA 4.0"
 },
 {
  "url": "https://upload.wikimedia.org/wikipedia/commons/5/5a/London_King%27s_Cross_rainbow_light_tunnel_-_2023-06-25.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original",
  "page": "https://commons.wikimedia.org/wiki/File:London_King%27s_Cross_rainbow_light_tunnel_-_2023-06-25.jpg",
  "title": "London King's Cross rainbow light tunnel - 2023-06-25",
  "author": "The wub",
  "license": "CC BY-SA 4.0"
 }
];
