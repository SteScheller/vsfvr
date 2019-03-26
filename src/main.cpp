#include <iostream>
#include <vector>
#include <array>
#include <fstream>

#include <boost/program_options.hpp>
namespace po = boost::program_options;

#include <json.hpp>
using json = nlohmann::json;

#include "mvr.hpp"
#include "progbar/progbar.hpp"

//-----------------------------------------------------------------------------
// function prototypes
//-----------------------------------------------------------------------------
int applyProgramOptions(
    int argc,
    char *argv[],
    mvr::Renderer &renderer,
    std::string& output,
    std::string& viewpoints,
    std::string& outputEntropies,
    double& k);

std::vector<std::array<float, 3>> getViewpointsFromFile(
    const std::string &file);

void writeEntropiesToFile(
        const std::string &path,
        const std::vector<std::array<float,3>> &viewpoints,
        const std::vector<double> &entropies);

//-----------------------------------------------------------------------------
// main program
//-----------------------------------------------------------------------------
int main(int argc, char *argv[])
{
    int ret = EXIT_SUCCESS;
    mvr::Renderer renderer;
    std::string output = "";
    std::string viewpointsFile = "";
    std::string outputEntropies = "";
    double k = 0.9;

    ret = renderer.initialize();
    if (EXIT_SUCCESS != ret)
    {
        std::cout << "Error: failed to initialize renderer." << std::endl;
        return ret;
    }

    ret = applyProgramOptions(
        argc, argv, renderer, output, viewpointsFile, outputEntropies, k);
    if (EXIT_SUCCESS != ret)
    {
        std::cout <<
            "Error: failed to apply command line arguments." << std::endl;
        return ret;
    }

    if ("" != viewpointsFile)
    {
        // Read camera position from json file
        std::vector<std::array<float, 3>> viewpoints =
            getViewpointsFromFile(viewpointsFile);

        // Calc viewpoints entropies
        util::ProgressBar progbar(50, viewpoints.size());
        std::vector<double> entropies(viewpoints.size(), 0.0);
        for (size_t i = 0; i < viewpoints.size(); ++i)
        {
            progbar.print();
            std::cout.flush();

            entropies[i] = renderer.calcTimeseriesViewEntropy(
                viewpoints[i], k);
            ++progbar;
        }
        ++progbar;
        progbar.print();

        if ("" != outputEntropies)
        {
            // write the results to a csv file
            writeEntropiesToFile(outputEntropies, viewpoints, entropies);
        }
    }

    if ("" == output)
        ret = renderer.run();
    else
    {
        ret = renderer.renderToFile(output);
        if (EXIT_SUCCESS == ret)
            std::cout << "Successfully rendered to " << output << std::endl;
        else
            std::cout << "Error: failed rendering to " << output << std::endl;
    }


    if (EXIT_SUCCESS != ret)
    {
        printf("Error: renderer terminated with error code (%i).\n", ret);
        return ret;
    }

    return ret;
}

//-----------------------------------------------------------------------------
// subroutines
//-----------------------------------------------------------------------------
int applyProgramOptions(
        int argc,
        char *argv[],
        mvr::Renderer& renderer,
        std::string& output,
        std::string& viewpoints,
        std::string& outputEntropies,
        double& k)
{
    // Declare the supported options
    po::options_description desc("Allowed options");
    desc.add_options()
        ("help,h", "produce help message")
        ("volume,v", po::value<std::string>(), "volume description file")
        ("config,c", po::value<std::string>(), "renderer configuration file")
        ("viewpoints,p", po::value<std::string>(),
         "json file with viewpoints which shall be evaluated")
        ("entropies,e", po::value<std::string>(),
         "output file where the viewpoint entropies are written to")
        ("kfactor,k", po::value<double>(),
         "weighting factor for noteworthiness calculation")
        ("output-file,o", po::value<std::string>(), "batch mode output file")
    ;

    int ret = EXIT_SUCCESS;

    try
    {
        po::variables_map vm;
        po::store(po::parse_command_line(argc, argv, desc), vm);
        po::notify(vm);

        if (vm.count("help"))
        {
            std::cout << desc << std::endl;
            exit(EXIT_SUCCESS);
        }

        if (vm.count("config"))
        {
            ret = renderer.loadConfigFromFile(vm["config"].as<std::string>());
            if (EXIT_SUCCESS != ret)
            {
                std::cout <<
                    "Error: failed to apply config file." << std::endl;
                return ret;
            }
        }

        if (vm.count("volume"))
        {
            ret = renderer.loadVolumeFromFile(
                    vm["volume"].as<std::string>(), 0);
            if (EXIT_SUCCESS != ret)
            {
                std::cout <<
                    "Error: failed to load volume data set." << std::endl;
                return ret;
            }
        }

        if (vm.count("output-file"))
            output = vm["output-file"].as<std::string>();

        if (vm.count("viewpoints"))
            viewpoints = vm["viewpoints"].as<std::string>();

        if (vm.count("entropies"))
            outputEntropies = vm["entropies"].as<std::string>();

        if (vm.count("kfactor"))
            k = vm["kfactor"].as<double>();
    }
    catch(std::exception &e)
    {
        std::cout << "Invalid program options!" << std::endl;
        return EXIT_FAILURE;
    }

    return ret;
}

std::vector<std::array<float, 3>> getViewpointsFromFile(
    const std::string &file)
{
    std::vector<std::array<float, 3>> viewpoints;
    std::ifstream fs;

    fs.open(file.c_str(), std::ofstream::in);
    try
    {
        json conf;
        fs >> conf;

        // read list of viewpoints/ camera positions from json file
        if (!conf["viewpoints"].is_null())
        {
            for (
                json::const_iterator it = conf["viewpoints"].cbegin();
                it != conf["viewpoints"].cend();
                ++it)
            {
                viewpoints.emplace_back((*it).get<std::array<float, 3>>());
            }
        }

    }
    catch(std::exception &e)
    {
        std::cout << "Error loading viewpoints from file: " <<
            file << std::endl;
        std::cout << "General exception: " << e.what() << std::endl;
    }

    return viewpoints;
}

void writeEntropiesToFile(
        const std::string &path,
        const std::vector<std::array<float,3>> &viewpoints,
        const std::vector<double> &entropies)
{
    std::ofstream out(path);

    out << "index,camX,camY,camZ,viewpointEntropy" << std::endl;
    out << "index,red,green,blue,alpha" << std::endl;
    for (size_t i = 0; i < entropies.size(); ++i)
    {
        out << i << "," <<
           (viewpoints[i])[0] << "," <<
           (viewpoints[i])[1] << "," <<
           (viewpoints[i])[2] << "," <<
           entropies[i] << std::endl;
    }

    out.close();
}

